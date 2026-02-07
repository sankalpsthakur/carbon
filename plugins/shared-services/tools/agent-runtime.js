'use strict';

/**
 * Agent Runtime for CarbonKit.
 *
 * Reads agent .md files, parses YAML frontmatter, connects to MCP servers,
 * and executes an agent loop that processes tasks using allowed tools.
 *
 * Usage:
 *   const { AgentRuntime, parseAgentMarkdown } = require('./agent-runtime');
 *   const runtime = new AgentRuntime({ pluginsDir: '/path/to/plugins' });
 *   const agent = runtime.loadAgent('scope3-calculation', 'calculation-orchestrator');
 *   const result = await runtime.execute(agent, { task: 'Compute emissions', inputs: {...} });
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

/**
 * Parse a YAML-frontmatter agent markdown file.
 * Returns { frontmatter: {...}, body: '...' }
 */
function parseAgentMarkdown(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');

  if (lines[0].trim() !== '---') {
    return { frontmatter: {}, body: raw, raw };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { frontmatter: {}, body: raw, raw };
  }

  const frontmatterLines = lines.slice(1, endIdx);
  const body = lines.slice(endIdx + 1).join('\n').trim();

  // Simple YAML key-value parser for frontmatter
  const frontmatter = {};
  let currentKey = null;
  let currentList = null;

  for (const line of frontmatterLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // List item
    if (trimmed.startsWith('- ') && currentKey) {
      if (!currentList) currentList = [];
      currentList.push(trimmed.substring(2).trim());
      frontmatter[currentKey] = currentList;
      continue;
    }

    // Key-value
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      // Save previous list
      currentList = null;

      const key = trimmed.substring(0, colonIdx).trim();
      const val = trimmed.substring(colonIdx + 1).trim();
      currentKey = key;

      if (val === '' || val === '|' || val === '>') {
        // Value follows as list or block
        frontmatter[key] = null;
      } else {
        // Scalar value
        frontmatter[key] = parseScalar(val);
      }
    }
  }

  return { frontmatter, body, raw };
}

function parseScalar(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  // Strip quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ---------------------------------------------------------------------------
// MCP Client (stdio, minimal)
// ---------------------------------------------------------------------------

class McpClient {
  constructor(command, args, cwd) {
    this._command = command;
    this._args = args || [];
    this._cwd = cwd;
    this._proc = null;
    this._requestId = 0;
    this._pending = new Map();
    this._buffer = Buffer.alloc(0);
    this._initialized = false;
  }

  async connect() {
    this._proc = spawn(this._command, this._args, {
      cwd: this._cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this._proc.stdout.on('data', (chunk) => {
      this._buffer = Buffer.concat([this._buffer, chunk]);
      this._tryParse();
    });

    this._proc.stderr.on('data', (chunk) => {
      process.stderr.write(`[mcp-client] ${chunk}`);
    });

    this._proc.on('error', (err) => {
      for (const [, { reject }] of this._pending) {
        reject(err);
      }
      this._pending.clear();
    });

    this._proc.on('exit', () => {
      for (const [, { reject }] of this._pending) {
        reject(new Error('MCP server exited'));
      }
      this._pending.clear();
    });

    // Initialize
    const initResult = await this._send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'carbonkit-agent-runtime', version: '0.1.0' },
    });
    this._initialized = true;
    return initResult;
  }

  async listTools() {
    return this._send('tools/list', {});
  }

  async callTool(name, args) {
    return this._send('tools/call', { name, arguments: args });
  }

  disconnect() {
    if (this._proc) {
      this._proc.kill('SIGTERM');
      this._proc = null;
    }
    this._initialized = false;
  }

  _send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this._requestId;
      this._pending.set(id, { resolve, reject });

      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      const frame = `Content-Length: ${Buffer.byteLength(msg, 'utf8')}\r\n\r\n${msg}`;
      this._proc.stdin.write(frame);

      // Timeout
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  _tryParse() {
    while (this._buffer.length > 0) {
      let headerEnd = this._buffer.indexOf('\r\n\r\n');
      let sepLen = 4;
      if (headerEnd === -1) {
        headerEnd = this._buffer.indexOf('\n\n');
        sepLen = 2;
      }
      if (headerEnd === -1) return;

      const headerText = this._buffer.slice(0, headerEnd).toString('utf8');
      const match = /content-length\s*:\s*(\d+)/i.exec(headerText);
      if (!match) {
        this._buffer = this._buffer.slice(headerEnd + sepLen);
        continue;
      }

      const bodyLen = parseInt(match[1], 10);
      const bodyStart = headerEnd + sepLen;
      if (this._buffer.length < bodyStart + bodyLen) return;

      const body = this._buffer.slice(bodyStart, bodyStart + bodyLen).toString('utf8');
      this._buffer = this._buffer.slice(bodyStart + bodyLen);

      try {
        const msg = JSON.parse(body);
        if (msg.id != null && this._pending.has(msg.id)) {
          const { resolve, reject } = this._pending.get(msg.id);
          this._pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || 'MCP error'));
          } else {
            resolve(msg.result);
          }
        }
      } catch (_e) {
        // skip malformed messages
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Agent Runtime
// ---------------------------------------------------------------------------

class AgentRuntime {
  /**
   * @param {object} opts
   * @param {string} opts.pluginsDir - root plugins directory
   */
  constructor(opts) {
    this._pluginsDir = path.resolve(opts.pluginsDir);
    this._mcpClients = new Map();
  }

  /**
   * Load and parse an agent definition.
   * @param {string} plugin - plugin directory name
   * @param {string} agentName - agent filename (without .md)
   * @returns {{ name, description, model, allowedTools, body, plugin, filePath }}
   */
  loadAgent(plugin, agentName) {
    const agentPath = path.join(this._pluginsDir, plugin, 'agents', `${agentName}.md`);
    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent not found: ${agentPath}`);
    }

    const { frontmatter, body } = parseAgentMarkdown(agentPath);

    return {
      name: frontmatter.name || agentName,
      description: frontmatter.description || '',
      model: frontmatter.model || 'claude-sonnet-4-5-20250929',
      allowedTools: frontmatter.allowedTools || [],
      body,
      plugin,
      filePath: agentPath,
    };
  }

  /**
   * List all agents in a plugin.
   * @param {string} plugin
   * @returns {string[]} agent names (without .md)
   */
  listAgents(plugin) {
    const agentsDir = path.join(this._pluginsDir, plugin, 'agents');
    if (!fs.existsSync(agentsDir)) return [];
    return fs.readdirSync(agentsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
  }

  /**
   * Connect to an MCP server for a plugin.
   * @param {string} plugin
   * @returns {Promise<McpClient>}
   */
  async connectMcp(plugin) {
    if (this._mcpClients.has(plugin)) {
      return this._mcpClients.get(plugin);
    }

    const mcpJsonPath = path.join(this._pluginsDir, plugin, '.mcp.json');
    if (!fs.existsSync(mcpJsonPath)) {
      throw new Error(`No .mcp.json found for plugin: ${plugin}`);
    }

    const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
    const servers = mcpConfig.mcpServers || {};
    const serverName = Object.keys(servers)[0];
    if (!serverName) throw new Error(`No MCP servers defined in ${mcpJsonPath}`);

    const serverDef = servers[serverName];
    const cwd = (serverDef.cwd || '').replace('${CLAUDE_PLUGIN_ROOT}', path.join(this._pluginsDir, plugin));

    const client = new McpClient(
      serverDef.command || 'node',
      serverDef.args || [],
      cwd || path.join(this._pluginsDir, plugin)
    );

    await client.connect();
    this._mcpClients.set(plugin, client);
    return client;
  }

  /**
   * Execute a task with an agent.
   * This is a simplified execution that calls tools directly (no LLM loop).
   * For full LLM-driven execution, use with llm-router.
   *
   * @param {object} agent - loaded agent definition
   * @param {object} params
   * @param {string} params.task - task description
   * @param {object} [params.inputs] - input key-values
   * @param {string[]} [params.tools] - override tool list
   * @returns {Promise<{status, outputs, toolCalls, error?}>}
   */
  async execute(agent, params) {
    const startedAt = new Date().toISOString();
    const toolCalls = [];

    try {
      const client = await this.connectMcp(agent.plugin);
      const toolList = await client.listTools();
      const availableTools = (toolList.tools || []).map((t) => t.name);

      // Filter to allowed tools
      const allowed = new Set(params.tools || agent.allowedTools);
      const usableTools = availableTools.filter((t) => allowed.has(t));

      return {
        status: 'ready',
        agent: agent.name,
        plugin: agent.plugin,
        task: params.task,
        inputs: params.inputs || {},
        usable_tools: usableTools,
        available_tools: availableTools,
        started_at: startedAt,
        tool_calls: toolCalls,
        note: 'Agent runtime prepared. Full LLM-driven execution requires llm-router integration.',
      };
    } catch (err) {
      return {
        status: 'error',
        agent: agent.name,
        plugin: agent.plugin,
        error: err.message,
        started_at: startedAt,
        tool_calls: toolCalls,
      };
    }
  }

  /**
   * Disconnect all MCP clients.
   */
  async shutdown() {
    for (const [, client] of this._mcpClients) {
      client.disconnect();
    }
    this._mcpClients.clear();
  }
}

module.exports = { AgentRuntime, McpClient, parseAgentMarkdown };
