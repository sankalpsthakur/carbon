#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLUGINS_ROOT = path.resolve(__dirname, '..', '..');

function die(msg) {
  process.stderr.write(`carbon: ${msg}\n`);
  process.exit(1);
}

function info(msg) {
  process.stdout.write(`${msg}\n`);
}

function resolvePluginDir(name) {
  const dir = path.join(PLUGINS_ROOT, name);
  if (!fs.existsSync(dir)) die(`plugin "${name}" not found at ${dir}`);
  return dir;
}

function readPluginJson(dir) {
  const p = path.join(dir, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(p)) die(`plugin.json not found at ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * carbon init <name>
 * Scaffold a new plugin directory with standard layout.
 */
function cmdInit(name) {
  if (!name) die('usage: carbon init <name>');

  const dir = path.join(PLUGINS_ROOT, name);
  if (fs.existsSync(dir)) die(`directory already exists: ${dir}`);

  const dirs = [
    '',
    '.claude-plugin',
    'agents',
    'commands',
    'skills',
    'tools',
  ];

  for (const d of dirs) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }

  // plugin.json
  const pluginJson = {
    name,
    version: '0.1.0',
    description: `${name} plugin`,
    author: { name: '' },
  };
  fs.writeFileSync(
    path.join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(pluginJson, null, 2) + '\n',
    'utf8'
  );

  // empty .mcp.json
  fs.writeFileSync(
    path.join(dir, '.mcp.json'),
    JSON.stringify({ mcpServers: {} }, null, 2) + '\n',
    'utf8'
  );

  info(`Scaffolded plugin at ${dir}`);
  info('  .claude-plugin/plugin.json');
  info('  agents/');
  info('  commands/');
  info('  skills/');
  info('  tools/');
  info('  .mcp.json');
}

/**
 * carbon run <plugin>:<command>
 * Spawn the plugin's MCP server and send a tools/call request.
 */
function cmdRun(spec) {
  if (!spec || !spec.includes(':')) die('usage: carbon run <plugin>:<command>');

  const [pluginName, command] = spec.split(':', 2);
  const dir = resolvePluginDir(pluginName);

  // Find the MCP server entry point
  const mcpJson = path.join(dir, '.mcp.json');
  if (!fs.existsSync(mcpJson)) die(`no .mcp.json in ${dir}`);

  const mcpConfig = JSON.parse(fs.readFileSync(mcpJson, 'utf8'));
  const servers = mcpConfig.mcpServers || {};
  const serverNames = Object.keys(servers);

  if (serverNames.length === 0) {
    // Fallback: look for tools/*-mcp.js
    const toolsDir = path.join(dir, 'tools');
    if (fs.existsSync(toolsDir)) {
      const mcpFiles = fs.readdirSync(toolsDir).filter((f) => f.endsWith('-mcp.js'));
      if (mcpFiles.length > 0) {
        const serverPath = path.join(toolsDir, mcpFiles[0]);
        info(`Spawning MCP server: node ${serverPath}`);
        runMcpCall(serverPath, command);
        return;
      }
    }
    die(`no MCP servers configured for ${pluginName}`);
  }

  // Use first server
  const serverConfig = servers[serverNames[0]];
  const cmd = serverConfig.command || '';

  if (cmd.includes('node')) {
    // Extract the script path from the command
    const args = serverConfig.args || [];
    const scriptPath = args.length > 0
      ? path.resolve(dir, args[args.length - 1])
      : null;

    if (scriptPath && fs.existsSync(scriptPath)) {
      info(`Spawning MCP server: node ${scriptPath}`);
      runMcpCall(scriptPath, command);
      return;
    }
  }

  info(`Spawning: ${cmd}`);
  const child = spawn('bash', ['-c', cmd], {
    cwd: dir,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env },
  });

  // Send initialize + tools/call with proper LSP framing
  const initMsg = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05' },
  });

  const callMsg = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: command, arguments: {} },
  });

  child.stdin.write(`Content-Length: ${Buffer.byteLength(initMsg)}\r\n\r\n${initMsg}`);
  setTimeout(() => {
    child.stdin.write(`Content-Length: ${Buffer.byteLength(callMsg)}\r\n\r\n${callMsg}`);
    setTimeout(() => {
      child.stdin.end();
    }, 500);
  }, 500);

  let output = '';
  child.stdout.on('data', (d) => { output += d.toString(); });
  child.on('close', () => {
    if (output.trim()) info(output.trim());
  });
}

function runMcpCall(serverPath, command) {
  const child = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env },
  });

  const initMsg = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05' },
  });

  const callMsg = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: command, arguments: {} },
  });

  child.stdin.write(`Content-Length: ${Buffer.byteLength(initMsg)}\r\n\r\n${initMsg}`);
  setTimeout(() => {
    child.stdin.write(`Content-Length: ${Buffer.byteLength(callMsg)}\r\n\r\n${callMsg}`);
    setTimeout(() => child.stdin.end(), 500);
  }, 500);

  let output = '';
  child.stdout.on('data', (d) => { output += d.toString(); });
  child.on('close', () => {
    if (output.trim()) info(output.trim());
  });
}

/**
 * carbon validate <plugin-dir>
 * Check plugin.json, commands frontmatter, MCP server health.
 */
function cmdValidate(pluginNameOrDir) {
  if (!pluginNameOrDir) die('usage: carbon validate <plugin-dir>');

  const dir = fs.existsSync(pluginNameOrDir)
    ? path.resolve(pluginNameOrDir)
    : resolvePluginDir(pluginNameOrDir);

  const errors = [];
  const warnings = [];

  // 1. plugin.json
  const pluginJsonPath = path.join(dir, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(pluginJsonPath)) {
    errors.push('MISSING: .claude-plugin/plugin.json');
  } else {
    try {
      const pj = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
      if (!pj.name) errors.push('plugin.json: missing "name"');
      if (!pj.version) warnings.push('plugin.json: missing "version"');
      if (!pj.description) warnings.push('plugin.json: missing "description"');
    } catch (e) {
      errors.push(`plugin.json: invalid JSON — ${e.message}`);
    }
  }

  // 2. Commands frontmatter
  const cmdsDir = path.join(dir, 'commands');
  if (fs.existsSync(cmdsDir)) {
    const mdFiles = findMdFiles(cmdsDir);
    for (const f of mdFiles) {
      const content = fs.readFileSync(f, 'utf8');
      if (!content.startsWith('---')) {
        warnings.push(`command ${path.relative(dir, f)}: missing YAML frontmatter`);
      } else {
        const fmEnd = content.indexOf('---', 3);
        if (fmEnd < 0) {
          warnings.push(`command ${path.relative(dir, f)}: unclosed frontmatter`);
        } else {
          const fm = content.slice(3, fmEnd);
          if (!fm.includes('name:')) {
            warnings.push(`command ${path.relative(dir, f)}: frontmatter missing "name"`);
          }
        }
      }
    }
  } else {
    warnings.push('MISSING: commands/ directory');
  }

  // 3. MCP server health check
  const mcpJsonPath = path.join(dir, '.mcp.json');
  if (fs.existsSync(mcpJsonPath)) {
    try {
      JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
    } catch (e) {
      errors.push(`.mcp.json: invalid JSON — ${e.message}`);
    }
  }

  // Check for tools/*-mcp.js
  const toolsDir = path.join(dir, 'tools');
  if (fs.existsSync(toolsDir)) {
    const mcpFiles = fs.readdirSync(toolsDir).filter((f) => f.endsWith('-mcp.js'));
    for (const mf of mcpFiles) {
      const fp = path.join(toolsDir, mf);
      try {
        const initMsg = JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { protocolVersion: '2024-11-05' },
        });
        const framedMsg = `Content-Length: ${Buffer.byteLength(initMsg)}\r\n\r\n${initMsg}`;
        const result = execSync(
          `printf '%s' '${framedMsg.replace(/'/g, "'\\''")}' | node "${fp}" 2>/dev/null`,
          { timeout: 5000, encoding: 'utf8' }
        );
        if (result.includes('"result"')) {
          info(`  MCP OK: ${mf}`);
        } else {
          warnings.push(`MCP server ${mf}: no valid response to initialize`);
        }
      } catch {
        warnings.push(`MCP server ${mf}: failed health check (timeout or crash)`);
      }
    }
  }

  // 4. Required directories
  for (const sub of ['agents', 'skills']) {
    if (!fs.existsSync(path.join(dir, sub))) {
      warnings.push(`MISSING: ${sub}/ directory`);
    }
  }

  // Report
  const pluginName = path.basename(dir);
  info(`\nValidation: ${pluginName}`);
  info('─'.repeat(40));

  if (errors.length === 0 && warnings.length === 0) {
    info('  All checks passed.');
  }

  for (const e of errors) info(`  ERROR: ${e}`);
  for (const w of warnings) info(`  WARN:  ${w}`);
  info('');

  if (errors.length > 0) process.exit(1);
}

function findMdFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMdFiles(full));
    } else if (entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * carbon export <plugin>:<job_id>
 * Create an audit bundle with inputs, outputs, and hashes.
 */
function cmdExport(spec) {
  if (!spec || !spec.includes(':')) die('usage: carbon export <plugin>:<job_id>');

  const [pluginName, jobId] = spec.split(':', 2);
  const dir = resolvePluginDir(pluginName);

  // Look for data directory
  const dataDir = path.join(dir, 'data');
  if (!fs.existsSync(dataDir)) die(`no data/ directory in ${pluginName}`);

  // Collect all collection files
  const bundle = {
    plugin: pluginName,
    job_id: jobId,
    exported_at: new Date().toISOString(),
    files: {},
  };

  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const content = fs.readFileSync(path.join(dataDir, f), 'utf8');
    bundle.files[f] = {
      sha256: sha256(content),
      size_bytes: Buffer.byteLength(content),
    };

    // If this collection contains the job, include its data
    try {
      const docs = JSON.parse(content);
      if (Array.isArray(docs)) {
        const jobDoc = docs.find((d) => d._id === jobId || d.job_id === jobId);
        if (jobDoc) {
          bundle.files[f].job_data = jobDoc;
        }
      }
    } catch {
      // skip non-array files
    }
  }

  // Include audit log
  const auditPath = path.join(dataDir, '_audit_log.json');
  if (fs.existsSync(auditPath)) {
    const auditContent = fs.readFileSync(auditPath, 'utf8');
    bundle.audit_log_sha256 = sha256(auditContent);
    try {
      const log = JSON.parse(auditContent);
      bundle.audit_entries = log.length;
    } catch {
      // skip
    }
  }

  // Write bundle
  const bundlePath = path.join(dataDir, `export_${jobId}_${Date.now()}.json`);
  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2), 'utf8');
  info(`Audit bundle written to ${bundlePath}`);
  info(JSON.stringify(bundle, null, 2));
}

/**
 * carbon list
 * List all installed plugins with their commands.
 */
function cmdList() {
  const entries = fs.readdirSync(PLUGINS_ROOT, { withFileTypes: true });
  const plugins = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const pjPath = path.join(PLUGINS_ROOT, entry.name, '.claude-plugin', 'plugin.json');
    if (!fs.existsSync(pjPath)) continue;

    try {
      const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
      const cmdsDir = path.join(PLUGINS_ROOT, entry.name, 'commands');
      let commands = [];
      if (fs.existsSync(cmdsDir)) {
        commands = findMdFiles(cmdsDir).map((f) => path.relative(cmdsDir, f).replace(/\.md$/, ''));
      }

      plugins.push({
        name: pj.name || entry.name,
        version: pj.version || '?.?.?',
        description: pj.description || '',
        commands,
      });
    } catch {
      // skip broken plugin.json
    }
  }

  if (plugins.length === 0) {
    info('No plugins found.');
    return;
  }

  info(`\nInstalled plugins (${plugins.length}):\n`);
  for (const p of plugins) {
    info(`  ${p.name}@${p.version}`);
    if (p.description) info(`    ${p.description}`);
    if (p.commands.length > 0) {
      info(`    Commands: ${p.commands.join(', ')}`);
    } else {
      info('    Commands: (none)');
    }
    info('');
  }
}

// ---------------------------------------------------------------------------
// CLI Router
// ---------------------------------------------------------------------------

const [,, cmd, ...args] = process.argv;

// Interactive agent mode: no args or 'chat' command
if (!cmd || cmd === 'chat') {
  const { startAgent } = require('./carbon-agent');
  startAgent({ resume: cmd === 'chat' ? args[0] : null }).catch((err) => {
    die(err.message);
  });
} else {
  switch (cmd) {
    case 'init':
      cmdInit(args[0]);
      break;
    case 'run':
      cmdRun(args[0]);
      break;
    case 'validate':
      cmdValidate(args[0]);
      break;
    case 'export':
      cmdExport(args[0]);
      break;
    case 'list':
      cmdList();
      break;
    case 'help':
    case '--help':
    case '-h':
      info('Carbon — AI agent for Scope 1/2/3 carbon accounting\n');
      info('Usage:\n');
      info('  carbon                     Launch interactive agent (requires ANTHROPIC_API_KEY)');
      info('  carbon chat [session-id]   Launch agent (optionally resume a session)\n');
      info('  carbon <command> [args]    Run a utility command\n');
      info('Commands:');
      info('  init <name>              Scaffold a new plugin directory');
      info('  run <plugin>:<command>   Spawn MCP server and send tools/call');
      info('  validate <plugin-dir>    Check plugin.json, commands, MCP health');
      info('  export <plugin>:<job_id> Create audit bundle (inputs, outputs, hashes)');
      info('  list                     List all installed plugins');
      info('  help                     Show this help');
      break;
    default:
      die(`unknown command: ${cmd}. Run "carbon help" for usage.`);
  }
}
