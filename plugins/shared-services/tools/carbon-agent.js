#!/usr/bin/env node
'use strict';

const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// ANSI formatting
// ---------------------------------------------------------------------------

const a = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  gray:   '\x1b[90m',
};

function rule(label) {
  const w = Math.min(process.stdout.columns || 80, 56);
  if (!label) return `  ${a.dim}${'─'.repeat(w)}${a.reset}`;
  const after = Math.max(0, w - label.length - 5);
  return `  ${a.dim}───${a.reset} ${a.bold}${label}${a.reset} ${a.dim}${'─'.repeat(after)}${a.reset}`;
}

function pad(name, width) {
  return ' '.repeat(Math.max(1, (width || 14) - name.length));
}

function formatToolName(name) {
  if (name.startsWith('mcp__')) {
    const rest = name.slice(5);
    const sep = rest.indexOf('__');
    if (sep !== -1) return rest.slice(0, sep) + '.' + rest.slice(sep + 2);
  }
  return name;
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

class Spinner {
  constructor(text) {
    this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.text = text || '';
    this.i = 0;
    this.timer = null;
  }

  start() {
    this._draw();
    this.timer = setInterval(() => this._draw(), 80);
    return this;
  }

  _draw() {
    const f = this.frames[this.i++ % this.frames.length];
    process.stdout.write(`\r\x1b[2K  ${a.cyan}${f}${a.reset} ${a.dim}${this.text}${a.reset}`);
  }

  update(text) { this.text = text; }

  stop(line) {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    process.stdout.write('\r\x1b[2K');
    if (line) process.stdout.write(line + '\n');
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGINS_ROOT = path.resolve(__dirname, '..', '..');

const PROMPT = `${a.cyan}${a.bold}carbon${a.reset} ${a.cyan}\u276f${a.reset} `;

const BANNER = `
 ${a.cyan}${a.bold} \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2557${a.reset}
 ${a.cyan}${a.bold}\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255d\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551${a.reset}
 ${a.cyan}${a.bold}\u2588\u2588\u2551     \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551${a.reset}
 ${a.cyan}${a.bold}\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u255a\u2588\u2588\u2557\u2588\u2588\u2551${a.reset}
 ${a.cyan}${a.bold}\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u255a\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255d\u2588\u2588\u2551 \u255a\u2588\u2588\u2588\u2588\u2551${a.reset}
 ${a.cyan}${a.bold} \u255a\u2550\u2550\u2550\u2550\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u255d  \u255a\u2550\u255d\u255a\u2550\u2550\u2550\u2550\u2550\u255d  \u255a\u2550\u2550\u2550\u2550\u2550\u255d \u255a\u2550\u255d  \u255a\u2550\u2550\u2550\u255d${a.reset}

  ${a.dim}Scope 1/2/3 Carbon Accounting Agent${a.reset}
`;

const SYSTEM_PROMPT = `You are Carbon, an AI agent specialized in Scope 1/2/3 carbon accounting and decarbonisation.

You have access to 6 MCP servers with 105 tools for carbon accounting:

- **calc** (mcp__calc__*): Emission factor management, spend-based calculations,
  data quality scoring, currency conversion, CSV ingestion, audit export
- **exec** (mcp__exec__*): Document processing, OCR, pipeline orchestration,
  supplier management, provenance tracking, PDF export
- **strategy** (mcp__strategy__*): CSRD/DMA materiality assessment, IRO management,
  risk scanning, evidence tracking, policy snapshots
- **scope12** (mcp__scope12__*): Scope 1/2 accounting, combustion/grid factors,
  KPI tracking, reporting periods, emission source calculations
- **swarm** (mcp__swarm__*): Multi-agent workflow orchestration, DAG execution,
  quality gates, self-healing recovery
- **connectors** (mcp__connectors__*): ERP/CRM schema mapping, data ingestion,
  format validation, field preview

## Agent Teams

You can create agent teams to parallelize complex work. Use teams when:
- Multiple independent workstreams can run in parallel
- Different specialists are needed (e.g. calculation, strategy, data ingestion)
- Research/review tasks benefit from competing perspectives

Recommended team configurations for carbon accounting:

1. **Full Assessment Team**: Spawn 4 teammates --
   - calc-engineer: Scope 3 emission calculations and factor management (mcp__calc__* tools)
   - scope12-engineer: Scope 1/2 accounting and KPI normalization (mcp__scope12__* tools)
   - strategy-analyst: CSRD materiality assessment and risk scanning (mcp__strategy__* tools)
   - data-engineer: ERP/CRM data ingestion and schema mapping (mcp__connectors__* tools)

2. **Audit Team**: Spawn 3 teammates --
   - reviewer: Verify emission calculations and data quality scores
   - evidence-auditor: Check provenance trails and documentation completeness
   - compliance-checker: Validate CSRD/ESRS requirements against assessment

3. **Data Pipeline Team**: Spawn 2 teammates --
   - ingestion-specialist: Map and validate source data through connectors
   - calc-operator: Process ingested data through the calculation engine

When creating teams, give each teammate specific MCP tools relevant to their role.
Use the Task tool to spawn subagents for quick focused work that doesn't need coordination.

## Common Workflows

1. Upload spend data -> compute Scope 3 emissions -> export audit bundle
2. Add emission factors -> map to categories -> calculate baselines
3. Run materiality assessment -> identify risks -> create reduction strategies
4. Ingest ERP data -> validate schemas -> feed into calculation engine

Always show your work. When calculating emissions, display the formula,
emission factors used, and data quality scores.`;

const SERVER_PATHS = {
  calc: path.resolve(PLUGINS_ROOT, 'scope3-calculation/tools/calc-mcp.js'),
  exec: path.resolve(PLUGINS_ROOT, 'scope3-execution/tools/exec-mcp.js'),
  strategy: path.resolve(PLUGINS_ROOT, 'scope3-strategy/tools/strategy-mcp.js'),
  scope12: path.resolve(PLUGINS_ROOT, 'scope12-accounting/tools/scope12-mcp.js'),
  swarm: path.resolve(PLUGINS_ROOT, 'swarms/tools/swarm-mcp.js'),
  connectors: path.resolve(PLUGINS_ROOT, 'connectors/tools/connectors-mcp.js'),
};

// ---------------------------------------------------------------------------
// MCP Bridge — persistent child process for each MCP server
// ---------------------------------------------------------------------------

class McpBridge {
  constructor(name, scriptPath) {
    this.name = name;
    this.scriptPath = scriptPath;
    this.child = null;
    this.tools = [];
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = Buffer.alloc(0);
  }

  async start() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('startup timeout')), 10000);

      this.child = spawn('node', [this.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      this.child.stdout.on('data', (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this._parse();
      });

      this.child.stderr.on('data', () => {});
      this.child.on('error', (err) => { clearTimeout(timeout); reject(err); });
      this.child.on('close', () => { this.child = null; });

      this._send('initialize', { protocolVersion: '2024-11-05' })
        .then(() => {
          this._notify('notifications/initialized', {});
          return this._send('tools/list', {});
        })
        .then((result) => {
          this.tools = result.tools || [];
          clearTimeout(timeout);
          resolve();
        })
        .catch((err) => { clearTimeout(timeout); reject(err); });
    });
  }

  _parse() {
    while (true) {
      let hEnd = this.buffer.indexOf('\r\n\r\n');
      let sepLen = 4;
      if (hEnd === -1) { hEnd = this.buffer.indexOf('\n\n'); sepLen = 2; }
      if (hEnd === -1) return;

      const header = this.buffer.slice(0, hEnd).toString();
      const m = /content-length:\s*(\d+)/i.exec(header);
      if (!m) { this.buffer = this.buffer.slice(hEnd + sepLen); continue; }

      const bodyLen = parseInt(m[1]);
      const bodyStart = hEnd + sepLen;
      if (this.buffer.length < bodyStart + bodyLen) return;

      const body = this.buffer.slice(bodyStart, bodyStart + bodyLen).toString();
      this.buffer = this.buffer.slice(bodyStart + bodyLen);

      try {
        const msg = JSON.parse(body);
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch (_) { /* ignore parse errors */ }
    }
  }

  _send(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.child) return reject(new Error(`${this.name} not running`));

      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });

      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.child.stdin.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${this.name}.${method} timed out`));
        }
      }, 30000);
    });
  }

  _notify(method, params) {
    if (!this.child) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params });
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);
  }

  async callTool(name, args) {
    return this._send('tools/call', { name, arguments: args || {} });
  }

  stop() {
    if (this.child) { this.child.kill(); this.child = null; }
    for (const { reject } of this.pending.values()) reject(new Error('stopped'));
    this.pending.clear();
  }
}

// ---------------------------------------------------------------------------
// JSON Schema -> Zod shape converter (for SDK tool() registration)
// ---------------------------------------------------------------------------

function jsonSchemaToZod(schema, z) {
  if (!schema || !schema.properties) return {};
  const shape = {};
  const required = schema.required || [];

  for (const [key, prop] of Object.entries(schema.properties)) {
    let zodType;

    if (prop.enum && prop.enum.length > 0) {
      zodType = z.enum(prop.enum);
    } else {
      switch (prop.type) {
        case 'string':  zodType = z.string(); break;
        case 'number':
        case 'integer': zodType = z.number(); break;
        case 'boolean': zodType = z.boolean(); break;
        case 'array':   zodType = z.array(z.unknown()); break;
        case 'object':  zodType = z.record(z.string(), z.unknown()); break;
        default:        zodType = z.unknown(); break;
      }
    }

    if (prop.description) zodType = zodType.describe(prop.description);
    if (!required.includes(key)) zodType = zodType.optional();
    shape[key] = zodType;
  }

  return shape;
}

// ---------------------------------------------------------------------------
// Agent REPL
// ---------------------------------------------------------------------------

async function startAgent(opts = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write(`\n  ${a.red}${a.bold}Error${a.reset} ANTHROPIC_API_KEY not set.\n\n`);
    process.stderr.write(`  Set it via environment variable:\n`);
    process.stderr.write(`  ${a.dim}export ANTHROPIC_API_KEY=sk-ant-...${a.reset}\n\n`);
    process.exit(1);
  }

  // Enable agent teams
  process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';

  const { query, tool, createSdkMcpServer } = await import('@anthropic-ai/claude-agent-sdk');
  const { z } = await import('zod');

  process.stdout.write(BANNER);
  process.stdout.write('\n');

  // ----- Start MCP bridges and create in-process SDK servers -----
  const bridges = {};
  const sdkServers = {};
  let totalTools = 0;

  for (const [name, scriptPath] of Object.entries(SERVER_PATHS)) {
    const spin = new Spinner(`Connecting ${name}...`);
    spin.start();
    try {
      const bridge = new McpBridge(name, scriptPath);
      await bridge.start();
      bridges[name] = bridge;

      const toolDefs = bridge.tools.map((t) => {
        const zodShape = jsonSchemaToZod(t.inputSchema, z);
        return tool(
          t.name,
          t.description || `${name} tool: ${t.name}`,
          zodShape,
          async (args) => {
            try {
              return await bridge.callTool(t.name, args);
            } catch (err) {
              return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
            }
          }
        );
      });

      sdkServers[name] = createSdkMcpServer({ name, version: '1.0.0', tools: toolDefs });
      totalTools += bridge.tools.length;
      spin.stop(`  ${a.green}\u25cf${a.reset} ${a.bold}${name}${a.reset}${pad(name)}${a.dim}${bridge.tools.length} tools${a.reset}`);
    } catch (err) {
      spin.stop(`  ${a.red}\u25cf${a.reset} ${a.bold}${name}${a.reset}${pad(name)}${a.red}failed${a.reset} ${a.dim}${err.message}${a.reset}`);
    }
  }

  const serverCount = Object.keys(bridges).length;
  process.stdout.write(`\n  ${a.dim}${totalTools} tools across ${serverCount} servers \xb7 Type ${a.reset}/help${a.dim} for commands${a.reset}\n\n`);

  // ----- Session state -----
  let sessionId = opts.resume || null;
  let totalCostUsd = 0;
  let totalTurns = 0;

  if (sessionId) {
    process.stdout.write(`  ${a.dim}Resuming session ${sessionId}${a.reset}\n\n`);
  }

  function cleanup() {
    for (const b of Object.values(bridges)) b.stop();
  }
  process.on('exit', cleanup);

  // ----- REPL -----
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
  });

  let abortController = null;
  let sigintCount = 0;

  rl.on('SIGINT', () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
      process.stdout.write(`\n  ${a.yellow}interrupted${a.reset}\n\n`);
      rl.prompt();
      return;
    }
    sigintCount++;
    if (sigintCount >= 2) {
      process.stdout.write('\n');
      process.exit(0);
    }
    process.stdout.write(`\n  ${a.dim}Press Ctrl+C again to exit${a.reset}\n\n`);
    rl.prompt();
    setTimeout(() => { sigintCount = 0; }, 2000);
  });

  process.on('SIGINT', () => {
    if (abortController) { abortController.abort(); abortController = null; }
  });

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }

    // ---- Slash commands ----

    if (input === '/exit' || input === '/quit') {
      process.stdout.write('\n');
      rl.close();
      process.exit(0);
    }

    if (input === '/help') {
      process.stdout.write('\n');
      process.stdout.write(rule('Commands') + '\n\n');
      const cmds = [
        ['/status',  'Server connection status'],
        ['/session', 'Session ID for resume'],
        ['/cost',    'Accumulated cost & turns'],
        ['/clear',   'Clear the screen'],
        ['/help',    'Show this help'],
        ['/exit',    'Exit Carbon'],
      ];
      for (const [cmd, desc] of cmds) {
        process.stdout.write(`    ${a.cyan}${cmd}${a.reset}${pad(cmd, 12)}${a.dim}${desc}${a.reset}\n`);
      }
      process.stdout.write('\n');
      process.stdout.write(rule('Tips') + '\n\n');
      process.stdout.write(`    ${a.dim}Everything else is sent to the Carbon agent.${a.reset}\n`);
      process.stdout.write(`    ${a.dim}Ask to "create a team" for parallel multi-agent work.${a.reset}\n`);
      process.stdout.write('\n');
      rl.prompt();
      continue;
    }

    if (input === '/session') {
      process.stdout.write('\n');
      if (sessionId) {
        process.stdout.write(`  ${a.dim}Session${a.reset}  ${sessionId}\n`);
        process.stdout.write(`  ${a.dim}Resume${a.reset}   ${a.cyan}carbon chat ${sessionId}${a.reset}\n`);
      } else {
        process.stdout.write(`  ${a.dim}No session yet \u2014 send a message to start one.${a.reset}\n`);
      }
      process.stdout.write('\n');
      rl.prompt();
      continue;
    }

    if (input === '/cost') {
      process.stdout.write('\n');
      process.stdout.write(`  ${a.dim}Cost${a.reset}   $${totalCostUsd.toFixed(4)}\n`);
      process.stdout.write(`  ${a.dim}Turns${a.reset}  ${totalTurns}\n`);
      process.stdout.write('\n');
      rl.prompt();
      continue;
    }

    if (input === '/status') {
      process.stdout.write('\n');
      process.stdout.write(rule('MCP Servers') + '\n\n');
      for (const [name, bridge] of Object.entries(bridges)) {
        process.stdout.write(`    ${a.green}\u25cf${a.reset} ${a.bold}${name}${a.reset}${pad(name)}${a.dim}${bridge.tools.length} tools${a.reset}\n`);
      }
      for (const name of Object.keys(SERVER_PATHS)) {
        if (!bridges[name]) {
          process.stdout.write(`    ${a.red}\u25cf${a.reset} ${a.bold}${name}${a.reset}${pad(name)}${a.dim}disconnected${a.reset}\n`);
        }
      }
      process.stdout.write('\n');
      rl.prompt();
      continue;
    }

    if (input === '/clear') {
      process.stdout.write('\x1b[2J\x1b[H');
      rl.prompt();
      continue;
    }

    if (input.startsWith('/')) {
      process.stdout.write(`  ${a.dim}Unknown command: ${input}. Type /help${a.reset}\n\n`);
      rl.prompt();
      continue;
    }

    // ---- Agent turn ----
    const turnStart = Date.now();

    try {
      abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        if (abortController) abortController.abort();
        process.stdout.write(`\n\n  ${a.yellow}Timed out after 10 minutes${a.reset}\n`);
      }, 600_000);

      const spinner = new Spinner('Thinking...');
      spinner.start();

      const queryOpts = {
        model: 'claude-sonnet-4-5-20250929',
        systemPrompt: SYSTEM_PROMPT,
        mcpServers: sdkServers,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
        maxTurns: 50,
        includePartialMessages: true,
        abortController,
        stderr: (data) => {
          const lower = data.toLowerCase();
          if (lower.includes('error') || lower.includes('fatal')) {
            process.stderr.write(`  ${a.red}${data.trim()}${a.reset}\n`);
          }
        },
      };

      if (sessionId) queryOpts.resume = sessionId;

      // Streaming input mode — required for in-process SDK MCP servers.
      // Messages must match the subprocess wire format exactly.
      async function* userMessage() {
        yield {
          type: 'user',
          session_id: '',
          message: { role: 'user', content: [{ type: 'text', text: input }] },
          parent_tool_use_id: null,
        };
      }

      const conversation = query({ prompt: userMessage(), options: queryOpts });

      let needsNewline = false;
      let spinnerActive = true;
      let pendingTool = null;   // { name, chunks: [] }
      let lastBlockWasTool = false;

      // Finalize a pending tool call: parse accumulated JSON args
      // and display a formatted line with context.
      function finalizeTool() {
        if (!pendingTool) return;
        const rawName = pendingTool.name;
        const name = formatToolName(rawName);
        let detail = '';

        // Extract useful context from tool arguments
        try {
          const json = JSON.parse(pendingTool.chunks.join(''));
          if (rawName === 'Task') {
            const parts = [];
            if (json.name) parts.push(json.name);
            if (json.description) parts.push(json.description);
            if (parts.length) detail = `  ${a.gray}${parts.join(' \u2014 ')}${a.reset}`;
          } else if (rawName === 'Read' && json.file_path) {
            detail = `  ${a.gray}${json.file_path}${a.reset}`;
          } else if (rawName === 'Bash' && json.description) {
            detail = `  ${a.gray}${json.description}${a.reset}`;
          } else if (rawName === 'Grep' && json.pattern) {
            detail = `  ${a.gray}${json.pattern}${a.reset}`;
          } else if (rawName === 'Glob' && json.pattern) {
            detail = `  ${a.gray}${json.pattern}${a.reset}`;
          }
        } catch (_) { /* partial or invalid JSON — show name only */ }

        if (needsNewline) { process.stdout.write('\n'); needsNewline = false; }
        // Blank line before first tool in a sequence (not between consecutive tools)
        if (!lastBlockWasTool) process.stdout.write('\n');
        process.stdout.write(`  ${a.cyan}\u25c6${a.reset} ${a.dim}${name}${a.reset}${detail}\n`);
        lastBlockWasTool = true;
        pendingTool = null;
      }

      for await (const message of conversation) {
        // Stop spinner on first message of any kind
        if (spinnerActive) {
          spinner.stop();
          spinnerActive = false;
        }

        if (message.type === 'system' && message.subtype === 'init') {
          sessionId = message.session_id;
          continue;
        }

        if (message.type === 'stream_event') {
          const evt = message.event;

          // Tool call start — defer display until we have arguments
          if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
            finalizeTool(); // flush any previous pending tool
            pendingTool = { name: evt.content_block.name, chunks: [] };
          }

          // Tool argument streaming — accumulate JSON chunks
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'input_json_delta') {
            if (pendingTool) pendingTool.chunks.push(evt.delta.partial_json);
          }

          // Block end — finalize the tool display
          if (evt.type === 'content_block_stop') {
            finalizeTool();
          }

          // Streaming text
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            finalizeTool(); // flush any pending tool before text
            if (lastBlockWasTool) { process.stdout.write('\n'); lastBlockWasTool = false; }
            process.stdout.write(evt.delta.text);
            needsNewline = !evt.delta.text.endsWith('\n');
          }
          continue;
        }

        if (message.type === 'result') {
          finalizeTool();
          clearTimeout(timeoutId);
          if (needsNewline) { process.stdout.write('\n'); needsNewline = false; }

          const turnCost = message.total_cost_usd || 0;
          const turnCount = message.num_turns || 0;
          totalCostUsd += turnCost;
          totalTurns += turnCount;

          const elapsed = ((Date.now() - turnStart) / 1000).toFixed(1);

          // Turn-end metadata
          if (lastBlockWasTool) process.stdout.write('\n');
          process.stdout.write('\n');
          const parts = [];
          if (turnCost > 0) parts.push(`$${turnCost.toFixed(4)}`);
          if (turnCount > 0) parts.push(`${turnCount} turn${turnCount !== 1 ? 's' : ''}`);
          parts.push(`${elapsed}s`);
          process.stdout.write(`  ${a.dim}${parts.join(' \xb7 ')}${a.reset}\n`);

          if (message.subtype !== 'success') {
            process.stdout.write(`  ${a.yellow}${message.subtype}${a.reset}\n`);
          }
          lastBlockWasTool = false;
        }
      }

      // Safety: stop spinner if never stopped (e.g. empty conversation)
      if (spinnerActive) spinner.stop();
      clearTimeout(timeoutId);
      if (needsNewline) process.stdout.write('\n');
    } catch (err) {
      if (err.name !== 'AbortError') {
        process.stderr.write(`\n  ${a.red}${a.bold}Error${a.reset} ${err.message}\n`);
        if (process.env.DEBUG) {
          process.stderr.write(`  ${a.dim}${err.stack}${a.reset}\n`);
        }
      }
    } finally {
      abortController = null;
    }

    process.stdout.write('\n');
    rl.prompt();
  }
}

module.exports = { startAgent };

if (require.main === module) {
  startAgent().catch((err) => {
    process.stderr.write(`${a.red}${a.bold}Fatal${a.reset} ${err.message}\n`);
    process.exit(1);
  });
}
