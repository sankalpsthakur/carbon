#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const path = require('path');

// ── LSP framing helpers ──────────────────────────────────────────────────────

function frame(obj) {
  const json = JSON.stringify(obj);
  const byteLen = Buffer.byteLength(json, 'utf8');
  return `Content-Length: ${byteLen}\r\n\r\n${json}`;
}

function parseFramedMessages(buf) {
  const messages = [];
  let offset = 0;

  while (offset < buf.length) {
    const headerEnd = buf.indexOf('\r\n\r\n', offset);
    if (headerEnd === -1) break;

    const headerText = buf.slice(offset, headerEnd).toString('utf8');
    const match = /content-length\s*:\s*(\d+)/i.exec(headerText);
    if (!match) { offset = headerEnd + 4; continue; }

    const bodyLen = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + bodyLen;
    if (buf.length < bodyEnd) break;

    const body = buf.slice(bodyStart, bodyEnd).toString('utf8');
    try { messages.push(JSON.parse(body)); } catch (_) { /* skip */ }
    offset = bodyEnd;
  }

  return { messages, remaining: buf.slice(offset) };
}

// ── Test one MCP server ──────────────────────────────────────────────────────

function testServer(serverPath, healthToolName) {
  return new Promise((resolve) => {
    const label = path.basename(path.dirname(path.dirname(serverPath)));
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ label, error: 'Timed out after 10s' });
    }, 10000);

    const child = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdoutBuf = Buffer.alloc(0);
    let stderrText = '';
    const responses = [];

    child.stdout.on('data', (chunk) => {
      stdoutBuf = Buffer.concat([stdoutBuf, chunk]);
      const { messages, remaining } = parseFramedMessages(stdoutBuf);
      stdoutBuf = remaining;
      for (const msg of messages) responses.push(msg);
    });

    child.stderr.on('data', (chunk) => {
      stderrText += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ label, error: `spawn error: ${err.message}` });
    });

    // Send the three requests sequentially with small delays
    const requests = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke-test', version: '1.0.0' } } },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: healthToolName, arguments: {} } },
    ];

    // Write all requests
    for (const req of requests) {
      child.stdin.write(frame(req));
    }

    // Wait for responses, then close
    const checkDone = setInterval(() => {
      if (responses.length >= 3) {
        clearInterval(checkDone);
        clearTimeout(timeout);
        child.kill('SIGTERM');

        // Analyze
        const initResp = responses.find((r) => r.id === 1);
        const listResp = responses.find((r) => r.id === 2);
        const healthResp = responses.find((r) => r.id === 3);

        const toolCount = listResp?.result?.tools?.length ?? 0;
        const toolNames = (listResp?.result?.tools || []).map((t) => t.name);

        let healthOk = false;
        let healthDetail = null;
        if (healthResp?.result?.content) {
          const textBlock = healthResp.result.content.find((c) => c.type === 'text');
          if (textBlock) {
            try {
              healthDetail = JSON.parse(textBlock.text);
              healthOk = true;
            } catch (_) {
              healthDetail = textBlock.text;
              healthOk = true;
            }
          }
        }
        if (healthResp?.result?.isError) healthOk = false;

        resolve({
          label,
          serverPath,
          initOk: !!initResp?.result?.protocolVersion,
          protocolVersion: initResp?.result?.protocolVersion,
          serverInfo: initResp?.result?.serverInfo,
          toolCount,
          toolNames,
          healthOk,
          healthDetail,
          stderr: stderrText || null,
        });
      }
    }, 50);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const smokeOnly = process.argv.includes('--smoke-only');
  console.log('=== CarbonKit MCP Server Test Suite ===');
  console.log(`Mode: ${smokeOnly ? 'Smoke Only' : 'Smoke + Functional'}`);
  console.log(`Running at ${new Date().toISOString()}\n`);

  const servers = [
    {
      path: path.resolve(__dirname, 'scope3-calculation/tools/calc-mcp.js'),
      healthTool: 'calc.health',
      expectedTools: 13,
    },
    {
      path: path.resolve(__dirname, 'scope3-execution/tools/exec-mcp.js'),
      healthTool: 'exec.health',
      expectedTools: 23,
    },
    {
      path: path.resolve(__dirname, 'scope3-strategy/tools/strategy-mcp.js'),
      healthTool: 'strategy.health',
      expectedTools: 20,
    },
    {
      path: path.resolve(__dirname, 'scope12-accounting/tools/scope12-mcp.js'),
      healthTool: 'scope12.health',
      expectedTools: 23,
    },
    {
      path: path.resolve(__dirname, 'swarms/tools/swarm-mcp.js'),
      healthTool: 'swarm.health',
      expectedTools: 16,
    },
    {
      path: path.resolve(__dirname, 'connectors/tools/connectors-mcp.js'),
      healthTool: 'connectors.health',
      expectedTools: 10,
    },
  ];

  const results = [];
  for (const srv of servers) {
    console.log(`Testing ${srv.path} ...`);
    const result = await testServer(srv.path, srv.healthTool);
    results.push({ ...result, expectedTools: srv.expectedTools });
  }

  console.log('\n=== Results ===\n');

  let allPass = true;
  for (const r of results) {
    const toolMatch = r.toolCount === r.expectedTools ? 'MATCH' : `MISMATCH (expected ${r.expectedTools})`;
    const pass = r.initOk && r.healthOk && !r.error;
    if (!pass) allPass = false;

    console.log(`--- ${r.label} ---`);
    if (r.error) {
      console.log(`  ERROR: ${r.error}`);
    } else {
      console.log(`  Initialize:  ${r.initOk ? 'PASS' : 'FAIL'} (protocol: ${r.protocolVersion})`);
      console.log(`  Server info: ${r.serverInfo?.name} v${r.serverInfo?.version}`);
      console.log(`  Tool count:  ${r.toolCount} (${toolMatch})`);
      console.log(`  Health:      ${r.healthOk ? 'PASS' : 'FAIL'}`);
      if (r.healthDetail) {
        const ts = r.healthDetail.timestamp || r.healthDetail.pid;
        if (ts) console.log(`  Health info: timestamp=${r.healthDetail.timestamp || 'n/a'}`);
      }
    }
    console.log(`  Overall:     ${pass ? 'PASS' : 'FAIL'}`);
    console.log('');
  }

  console.log(`=== Overall: ${allPass ? 'ALL PASS' : 'SOME FAILURES'} ===`);

  // Output JSON summary for programmatic use
  const summary = results.map((r) => ({
    server: r.label,
    toolCount: r.toolCount,
    expectedTools: r.expectedTools,
    healthPass: r.healthOk,
    initPass: r.initOk,
    overallPass: r.initOk && r.healthOk && !r.error,
  }));
  console.log('\nJSON Summary:');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
