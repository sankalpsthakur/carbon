#!/usr/bin/env node
'use strict';

// Test script for calc-mcp tools
const { spawn } = require('child_process');
const path = require('path');

const MCP_PATH = path.join(__dirname, 'tools', 'calc-mcp.js');

function sendMcpRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [MCP_PATH], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = Buffer.alloc(0);
    let resolved = false;

    proc.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      // Try to parse LSP framed message
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const headerText = buffer.slice(0, headerEnd).toString('utf8');
        const lengthMatch = /content-length\s*:\s*(\d+)/i.exec(headerText);

        if (lengthMatch) {
          const bodyLen = parseInt(lengthMatch[1], 10);
          const bodyStart = headerEnd + 4;

          if (buffer.length >= bodyStart + bodyLen) {
            const body = buffer.slice(bodyStart, bodyStart + bodyLen).toString('utf8');
            try {
              const response = JSON.parse(body);
              if (!resolved) {
                resolved = true;
                resolve(response);
              }
            } catch (e) {
              if (!resolved) {
                resolved = true;
                reject(new Error('Failed to parse response: ' + e.message));
              }
            }
          }
        }
      }
    });

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        if (code !== 0) {
          reject(new Error(`Process exited with code ${code}`));
        } else {
          reject(new Error('Process closed without response'));
        }
      }
    });

    // Send initialize first
    const initMsg = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    };

    const initJson = JSON.stringify(initMsg);
    proc.stdin.write(`Content-Length: ${Buffer.byteLength(initJson)}\r\n\r\n${initJson}`);

    // Wait a bit then send the actual request
    setTimeout(() => {
      const msg = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: method,
          arguments: params
        }
      };

      const json = JSON.stringify(msg);
      proc.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
    }, 100);
  });
}

async function runTests() {
  console.log('🧪 Testing Calculation Module Tools\n');

  const jobIds = [
    '7f1aabe1-28ea-45e9-9b06-61d9f6585db1', // Q1
    'd088b3a1-865e-4475-94a2-baf0a8099c3a', // Q2
    '494d7d66-5dcc-49c8-86a6-03f8effa25f6'  // Q3
  ];

  try {
    // Test 1: Health check
    console.log('1️⃣  Testing calc.health...');
    const health = await sendMcpRequest('calc.health');
    const healthContent = health.result?.content?.[0]?.text;
    console.log('✅ Health:', healthContent ? JSON.parse(healthContent) : health);

    // Test 2: List emission factors
    console.log('\n2️⃣  Testing calc.db.get (emission_factors)...');
    const factors = await sendMcpRequest('calc.db.get', {
      collection: 'emission_factors',
      limit: 5
    });
    const factorsData = JSON.parse(factors.result.content[0].text);
    console.log(`✅ Found ${factorsData.count} emission factors (showing 5)`);

    // Test 3: Compute emissions for Q1
    console.log('\n3️⃣  Testing calc.compute (Q1 2024)...');
    const compute = await sendMcpRequest('calc.compute', {
      job_id: jobIds[0],
      refresh: true
    });
    const computeData = JSON.parse(compute.result.content[0].text);
    console.log(`✅ Computed emissions: ${computeData.total_emissions_tco2e?.toFixed(2)} tCO2e`);
    console.log(`   Methodology breakdown:`, computeData.methodology_counts);

    // Test 4: DQS Score
    console.log('\n4️⃣  Testing calc.dqs_score (Q1 2024)...');
    const dqs = await sendMcpRequest('calc.dqs_score', {
      job_id: jobIds[0]
    });
    const dqsData = JSON.parse(dqs.result.content[0].text);
    console.log(`✅ DQS Score: ${dqsData.final_dqs}`);
    console.log(`   Base: ${dqsData.base_score}, Method: ${dqsData.method_score}`);

    // Test 5: Export CSV
    console.log('\n5️⃣  Testing calc.export (CSV format)...');
    const exportCsv = await sendMcpRequest('calc.export', {
      job_id: jobIds[0],
      format: 'csv'
    });
    const csvData = JSON.parse(exportCsv.result.content[0].text);
    console.log(`✅ CSV export: ${csvData.item_count} items, ${csvData.content?.split('\n').length} lines`);

    // Test 6: Export PDF
    console.log('\n6️⃣  Testing calc.export (PDF format)...');
    const exportPdf = await sendMcpRequest('calc.export', {
      job_id: jobIds[0],
      format: 'pdf'
    });
    const pdfData = JSON.parse(exportPdf.result.content[0].text);
    console.log(`✅ PDF export: ${pdfData.page_count} pages, ${pdfData.file_size_kb} KB`);

    // Test 7: Replay
    console.log('\n7️⃣  Testing calc.replay (Q1 2024)...');
    const replay = await sendMcpRequest('calc.replay', {
      job_id: jobIds[0]
    });
    const replayData = JSON.parse(replay.result.content[0].text);
    console.log(`✅ Replayed: ${replayData.total_emissions_tco2e?.toFixed(2)} tCO2e`);
    console.log(`   ${replayData.message}`);

    // Test 8: Hotspot Campaigns
    console.log('\n8️⃣  Testing calc.hotspot_campaigns (Q1 2024)...');
    const hotspots = await sendMcpRequest('calc.hotspot_campaigns', {
      job_id: jobIds[0],
      top_n: 5
    });
    const hotspotsData = JSON.parse(hotspots.result.content[0].text);
    console.log(`✅ Found ${hotspotsData.campaign_count} reduction opportunities`);
    console.log(`   Total potential reduction: ${hotspotsData.total_potential_reduction_tco2e} tCO2e (${hotspotsData.total_reduction_potential_pct}%)`);
    console.log(`\n   Top Campaign:`);
    const topCampaign = hotspotsData.campaigns[0];
    console.log(`   - ${topCampaign.vendor} (${topCampaign.category_name})`);
    console.log(`   - Current: ${topCampaign.emissions_tco2e?.toFixed(2)} tCO2e`);
    console.log(`   - Potential: ${topCampaign.potential_reduction_tco2e} tCO2e reduction`);
    console.log(`   - Priority: ${topCampaign.priority}, Timeline: ${topCampaign.timeline}`);

    // Test 9: FX Normalization
    console.log('\n9️⃣  Testing calc.fx_normalize...');
    const fx = await sendMcpRequest('calc.fx_normalize', {
      amount: 1000,
      from_currency: 'EUR',
      to_currency: 'USD'
    });
    const fxData = JSON.parse(fx.result.content[0].text);
    console.log(`✅ FX: ${fxData.original} ${fxData.from_currency} = ${fxData.converted?.toFixed(2)} ${fxData.to_currency} (rate: ${fxData.rate})`);

    console.log('\n✨ All tests passed!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
