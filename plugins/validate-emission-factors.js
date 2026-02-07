#!/usr/bin/env node
/**
 * Direct validation of emission factors via calc-mcp
 */

const { spawn } = require('child_process');
const readline = require('readline');

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
      reject(new Error('Timeout waiting for response'));
    }, 10000);

    proc.stdin.write(header + message);
  });
}

async function main() {
  const proc = spawn('node', ['scope3-calculation/tools/calc-mcp.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  try {
    // Initialize
    await rpcCall(proc, 'initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    console.log('✅ MCP initialized');

    // Ingest data with NAICS categories
    const ingestResult = await rpcCall(proc, 'tools/call', {
      name: 'calc.ingest',
      arguments: {
        filename: 'category-test.csv',
        rows: [
          { vendor: 'Acme Industrial', description: 'Steel bars', spend: 45000, currency: 'USD', category: '331110' },
          { vendor: 'GreenTech', description: 'Solar panels', spend: 128500, currency: 'USD', category: '334413' },
          { vendor: 'CloudScale', description: 'AWS hosting', spend: 24300, currency: 'USD', category: '518210' },
          { vendor: 'Delta Air', description: 'Business flights', spend: 4250, currency: 'USD', category: '481111' },
        ],
        reporting_currency: 'USD',
      },
    });

    console.log('✅ Ingest complete:', ingestResult.content[0].text);
    const result = JSON.parse(ingestResult.content[0].text);
    const jobId = result.job_id;

    // Compute emissions
    const computeResult = await rpcCall(proc, 'tools/call', {
      name: 'calc.compute',
      arguments: { job_id: jobId },
    });

    console.log('✅ Compute complete:', computeResult.content[0].text);
    const compute = JSON.parse(computeResult.content[0].text);

    console.log('\n=== EMISSION FACTORS VALIDATION ===');
    console.log(`Total emissions: ${compute.total_emissions_kgco2e} kgCO2e (${compute.total_emissions_tco2e} tCO2e)`);
    console.log(`Total spend: $${compute.total_spend_reporting} USD`);
    console.log(`Items: ${compute.inventory_item_count}`);
    console.log(`Methodology counts:`, compute.methodology_counts);

    if (compute.total_emissions_kgco2e > 0) {
      console.log('\n✅ SUCCESS: Emission factors loaded and matching!');
      console.log(`Expected methods: spend=${compute.methodology_counts.spend || 0} (should be 4)`);
    } else {
      console.log('\n❌ FAIL: Zero emissions - factors not matching');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    proc.kill();
  }
}

main();
