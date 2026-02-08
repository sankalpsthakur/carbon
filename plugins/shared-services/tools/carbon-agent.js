#!/usr/bin/env node
'use strict';

const path = require('path');
const readline = require('readline');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGINS_ROOT = path.resolve(__dirname, '..', '..');

const BANNER = `
  \x1b[36m██████╗ █████╗ ██████╗ ██████╗  ██████╗ ███╗   ██╗\x1b[0m
 \x1b[36m██╔════╝██╔══██╗██╔══██╗██╔══██╗██╔═══██╗████╗  ██║\x1b[0m
 \x1b[36m██║     ███████║██████╔╝██████╔╝██║   ██║██╔██╗ ██║\x1b[0m
 \x1b[36m██║     ██╔══██║██╔══██╗██╔══██╗██║   ██║██║╚██╗██║\x1b[0m
 \x1b[36m╚██████╗██║  ██║██║  ██║██████╔╝╚██████╔╝██║ ╚████║\x1b[0m
  \x1b[36m╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═══╝\x1b[0m

 Scope 1/2/3 Carbon Accounting Agent
 6 MCP servers \xb7 105 tools \xb7 Type /help for commands
`;

const SYSTEM_PROMPT = `You are Carbon, an AI agent specialized in Scope 1/2/3 carbon accounting and decarbonisation.

You have access to 6 MCP servers with 105 tools for carbon accounting:

- **calc** (mcp__calc__*): Emission factor management, spend-based calculations,
  data quality scoring, currency conversion, CSV ingestion, audit export
- **exec** (mcp__exec__*): Document processing, OCR, pipeline orchestration,
  page rendering, PDF export
- **strategy** (mcp__strategy__*): CSRD/DMA materiality assessment, IRO management,
  risk scanning, evidence tracking, policy snapshots
- **scope12** (mcp__scope12__*): Scope 1/2 accounting, facility management,
  KPI tracking, reporting periods, emission source calculations
- **swarm** (mcp__swarm__*): Multi-agent workflow orchestration, DAG execution,
  evidence chain validation, quality gates
- **connectors** (mcp__connectors__*): ERP/CRM schema mapping, data ingestion,
  format validation, field preview

Common workflows:
1. Upload spend data -> compute Scope 3 emissions -> export audit bundle
2. Add emission factors -> map to categories -> calculate baselines
3. Run materiality assessment -> identify risks -> create reduction strategies
4. Ingest ERP data -> validate schemas -> feed into calculation engine

Always show your work. When calculating emissions, display the formula,
emission factors used, and data quality scores.`;

const MCP_SERVERS = {
  calc: {
    command: 'node',
    args: [path.resolve(PLUGINS_ROOT, 'scope3-calculation/tools/calc-mcp.js')],
  },
  exec: {
    command: 'node',
    args: [path.resolve(PLUGINS_ROOT, 'scope3-execution/tools/exec-mcp.js')],
  },
  strategy: {
    command: 'node',
    args: [path.resolve(PLUGINS_ROOT, 'scope3-strategy/tools/strategy-mcp.js')],
  },
  scope12: {
    command: 'node',
    args: [path.resolve(PLUGINS_ROOT, 'scope12-accounting/tools/scope12-mcp.js')],
  },
  swarm: {
    command: 'node',
    args: [path.resolve(PLUGINS_ROOT, 'swarms/tools/swarm-mcp.js')],
  },
  connectors: {
    command: 'node',
    args: [path.resolve(PLUGINS_ROOT, 'connectors/tools/connectors-mcp.js')],
  },
};

// ---------------------------------------------------------------------------
// Agent REPL
// ---------------------------------------------------------------------------

async function startAgent(opts = {}) {
  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    process.stderr.write('\nError: ANTHROPIC_API_KEY not set.\n\n');
    process.stderr.write('Set it via environment variable:\n');
    process.stderr.write('  export ANTHROPIC_API_KEY=sk-ant-...\n\n');
    process.exit(1);
  }

  // Dynamic import — SDK is ESM-only
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  process.stdout.write(BANNER + '\n');

  // Session state
  let sessionId = opts.resume || null;
  let totalCostUsd = 0;
  let totalTurns = 0;
  let mcpStatus = null;

  if (sessionId) {
    process.stdout.write(`\x1b[90mResuming session ${sessionId}\x1b[0m\n\n`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[32mcarbon>\x1b[0m ',
  });

  let abortController = null;

  // Ctrl+C: interrupt running query or re-prompt
  rl.on('SIGINT', () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
      process.stdout.write('\n\x1b[33m[interrupted]\x1b[0m\n');
    } else {
      process.stdout.write('\n');
    }
    rl.prompt();
  });

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      continue;
    }

    // ---- Special commands ----
    if (input === '/exit' || input === '/quit') {
      process.stdout.write('Goodbye.\n');
      rl.close();
      process.exit(0);
    }

    if (input === '/help') {
      process.stdout.write('\nCommands:\n');
      process.stdout.write('  /status   Show MCP server connection status\n');
      process.stdout.write('  /session  Show current session ID (for resume)\n');
      process.stdout.write('  /cost     Show accumulated cost and turns\n');
      process.stdout.write('  /exit     Exit the agent\n');
      process.stdout.write('  /help     Show this help\n\n');
      process.stdout.write('Everything else is sent to the Carbon agent.\n\n');
      rl.prompt();
      continue;
    }

    if (input === '/session') {
      process.stdout.write(`Session: ${sessionId || '(not started yet — send a message first)'}\n`);
      if (sessionId) {
        process.stdout.write(`Resume with: carbon chat ${sessionId}\n`);
      }
      rl.prompt();
      continue;
    }

    if (input === '/cost') {
      process.stdout.write(`Cost: $${totalCostUsd.toFixed(4)} | Turns: ${totalTurns}\n`);
      rl.prompt();
      continue;
    }

    if (input === '/status') {
      if (mcpStatus) {
        process.stdout.write('\nMCP Servers:\n');
        for (const s of mcpStatus) {
          const icon = s.status === 'connected' ? '\x1b[32m●\x1b[0m' : '\x1b[31m●\x1b[0m';
          process.stdout.write(`  ${icon} ${s.name}: ${s.status}\n`);
        }
      } else {
        process.stdout.write('\nMCP Servers (configured, not yet connected):\n');
        for (const name of Object.keys(MCP_SERVERS)) {
          process.stdout.write(`  ○ ${name}\n`);
        }
      }
      process.stdout.write('\n');
      rl.prompt();
      continue;
    }

    if (input.startsWith('/')) {
      process.stdout.write(`Unknown command: ${input}. Type /help for available commands.\n`);
      rl.prompt();
      continue;
    }

    // ---- Agent turn ----
    try {
      abortController = new AbortController();

      const queryOpts = {
        model: 'claude-sonnet-4-5-20250929',
        systemPrompt: SYSTEM_PROMPT,
        mcpServers: MCP_SERVERS,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
        includePartialMessages: true,
        abortController,
      };

      if (sessionId) {
        queryOpts.resume = sessionId;
      }

      const conversation = query({ prompt: input, options: queryOpts });
      let needsNewline = false;

      for await (const message of conversation) {
        // Capture session ID and MCP status from init message
        if (message.type === 'system' && message.subtype === 'init') {
          sessionId = message.session_id;
          if (message.mcp_servers && message.mcp_servers.length > 0) {
            mcpStatus = message.mcp_servers;
            const connected = mcpStatus.filter((s) => s.status === 'connected').length;
            process.stdout.write(
              `\x1b[90m[${connected}/${mcpStatus.length} MCP servers connected]\x1b[0m\n`
            );
          }
          continue;
        }

        // Stream partial messages (text + tool indicators)
        if (message.type === 'stream_event') {
          const evt = message.event;

          // Show tool name when a tool call starts
          if (
            evt.type === 'content_block_start' &&
            evt.content_block &&
            evt.content_block.type === 'tool_use'
          ) {
            if (needsNewline) {
              process.stdout.write('\n');
              needsNewline = false;
            }
            process.stdout.write(`\x1b[90m[${evt.content_block.name}]\x1b[0m `);
          }

          // Stream text deltas
          if (
            evt.type === 'content_block_delta' &&
            evt.delta &&
            evt.delta.type === 'text_delta'
          ) {
            process.stdout.write(evt.delta.text);
            needsNewline = !evt.delta.text.endsWith('\n');
          }

          continue;
        }

        // Final result — accumulate cost
        if (message.type === 'result') {
          if (needsNewline) {
            process.stdout.write('\n');
            needsNewline = false;
          }
          if (message.total_cost_usd) totalCostUsd += message.total_cost_usd;
          if (message.num_turns) totalTurns += message.num_turns;

          if (message.subtype !== 'success') {
            process.stdout.write(
              `\x1b[33m[${message.subtype}]\x1b[0m\n`
            );
          }
        }
      }

      if (needsNewline) process.stdout.write('\n');
    } catch (err) {
      if (err.name === 'AbortError') {
        // Already handled in SIGINT handler
      } else {
        process.stderr.write(`\nError: ${err.message}\n`);
      }
    } finally {
      abortController = null;
    }

    process.stdout.write('\n');
    rl.prompt();
  }
}

module.exports = { startAgent };

// Allow running directly: node carbon-agent.js
if (require.main === module) {
  startAgent().catch((err) => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.exit(1);
  });
}
