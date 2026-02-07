#!/usr/bin/env node
const { JSONRPCClient } = require('../mcp-jsonrpc-client.js');

async function test() {
  const client = new JSONRPCClient('node', [
    'scope3-calculation/tools/calc-mcp.js',
  ]);

  await client.initialize();

  // Ingest with NAICS categories matching our emission factors
  const ingestResult = await client.callTool('calc.ingest', {
    filename: 'test-with-categories.csv',
    rows: [
      { vendor: 'Acme Industrial', description: 'Steel bars', spend: 45000, currency: 'USD', category: '331110' },
      { vendor: 'GreenTech', description: 'Solar panels', spend: 128500, currency: 'USD', category: '334413' },
      { vendor: 'CloudScale', description: 'AWS hosting', spend: 24300, currency: 'USD', category: '518210' },
    ],
    reporting_currency: 'USD',
  });

  console.log('Ingest result:', JSON.stringify(ingestResult, null, 2));

  if (ingestResult.job_id) {
    const computeResult = await client.callTool('calc.compute', { job_id: ingestResult.job_id });
    console.log('Compute result:', JSON.stringify(computeResult, null, 2));

    if (typeof computeResult.total_emissions_kgco2e === 'number' && computeResult.total_emissions_kgco2e > 0) {
      console.log('\n✅ SUCCESS: Emission factors working! Total emissions:', computeResult.total_emissions_kgco2e, 'kgCO2e');
      console.log('Method counts:', computeResult.methodology_counts);
    } else {
      console.log('\n❌ FAIL: total_emissions_kgco2e is', computeResult.total_emissions_kgco2e);
    }
  }

  await client.close();
}

test().catch(console.error);
