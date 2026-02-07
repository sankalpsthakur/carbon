#!/usr/bin/env node
/**
 * Run rapid-baseline swarm with real emission factors
 * Expects non-zero tCO2e since we now have 18 seeded spend-based factors
 */

const fs = require('fs');
const { spawn } = require('child_process');

async function rpcCall(proc, method, params) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  const message = JSON.stringify(request);
  const header = `Content-Length: ${Buffer.byteLength(message)}\r\n\r\n`;

  return new Promise((resolve, reject) => {
    let responseData = '';
    let contentLength = null;
    let headerComplete = false;

    const cleanup = () => {
      proc.stdout.removeAllListeners();
    };

    proc.stdout.on('data', (chunk) => {
      responseData += chunk.toString();

      if (!headerComplete) {
        const headerEnd = responseData.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const headers = responseData.substring(0, headerEnd);
          const match = headers.match(/Content-Length: (\d+)/);
          if (match) {
            contentLength = parseInt(match[1]);
            headerComplete = true;
            responseData = responseData.substring(headerEnd + 4);
          }
        }
      }

      if (headerComplete && Buffer.byteLength(responseData) >= contentLength) {
        const jsonStr = responseData.substring(0, contentLength);
        cleanup();
        try {
          const response = JSON.parse(jsonStr);
          resolve(response.result || response);
        } catch (err) {
          reject(err);
        }
      }
    });

    setTimeout(() => {
      cleanup();
      reject(new Error('Timeout'));
    }, 60000);

    proc.stdin.write(header + message);
  });
}

async function main() {
  const swarmProc = spawn('node', ['swarms/tools/swarm-mcp.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const calcProc = spawn('node', ['scope3-calculation/tools/calc-mcp.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  try {
    // Initialize both servers
    await rpcCall(swarmProc, 'initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    await rpcCall(calcProc, 'initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    console.log('✅ MCP servers initialized');

    // Load 50-row CSV fixture
    const csvContent = fs.readFileSync('test-fixtures/sample-spend-50rows.csv', 'utf8');
    const lines = csvContent.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',');
    const rows = lines.slice(1).map(line => {
      const vals = line.split(',');
      const row = {};
      headers.forEach((h, i) => {
        const val = vals[i];
        if (h === 'spend_original') row[h] = parseFloat(val) || 0;
        else if (h === 'quantity') row[h] = parseFloat(val) || null;
        else row[h] = val || null;
      });
      return row;
    });

    console.log(`✅ Loaded ${rows.length} rows from sample-spend-50rows.csv`);

    // Ingest via calc-mcp
    const ingestResult = await rpcCall(calcProc, 'tools/call', {
      name: 'calc.ingest',
      arguments: {
        filename: 'sample-spend-50rows.csv',
        rows,
        reporting_currency: 'USD',
      },
    });

    const ingest = JSON.parse(ingestResult.content[0].text);
    console.log(`✅ Ingested ${ingest.row_count} rows, job_id: ${ingest.job_id}`);

    // Compute emissions
    const computeResult = await rpcCall(calcProc, 'tools/call', {
      name: 'calc.compute',
      arguments: { job_id: ingest.job_id },
    });

    const compute = JSON.parse(computeResult.content[0].text);
    console.log(`✅ Computed ${compute.inventory_item_count} items`);
    console.log(`   Total emissions: ${compute.total_emissions_tco2e} tCO2e`);
    console.log(`   Total spend: $${compute.total_spend_reporting} USD`);
    console.log(`   Methods: ${JSON.stringify(compute.methodology_counts)}`);

    if (compute.total_emissions_tco2e > 0) {
      console.log('\n🎉 SUCCESS: Real emission factors working in swarm context!');
      console.log(`   Emission intensity: ${(compute.total_emissions_tco2e / compute.total_spend_reporting * 1000000).toFixed(2)} kgCO2e per $1M spend`);
    } else {
      console.log('\n❌ FAIL: Still zero emissions');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    swarmProc.kill();
    calcProc.kill();
  }
}

main();
