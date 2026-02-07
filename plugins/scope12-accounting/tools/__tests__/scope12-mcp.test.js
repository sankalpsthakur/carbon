'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

// ── MCP test client ──────────────────────────────────────────────────────────

function createMcpClient(serverPath, env) {
  const child = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });

  let buffer = Buffer.alloc(0);
  const pending = new Map();
  let nextId = 1;

  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length > 0) {
      let headerEnd = buffer.indexOf('\r\n\r\n');
      let sepLen = 4;
      if (headerEnd === -1) {
        headerEnd = buffer.indexOf('\n\n');
        sepLen = 2;
      }
      if (headerEnd === -1) return;

      const headerText = buffer.slice(0, headerEnd).toString('utf8');
      const match = /content-length\s*:\s*(\d+)/i.exec(headerText);
      if (!match) { buffer = buffer.slice(headerEnd + sepLen); continue; }

      const bodyLen = parseInt(match[1], 10);
      const bodyStart = headerEnd + sepLen;
      if (buffer.length < bodyStart + bodyLen) return;

      const body = buffer.slice(bodyStart, bodyStart + bodyLen).toString('utf8');
      buffer = buffer.slice(bodyStart + bodyLen);

      try {
        const msg = JSON.parse(body);
        const resolve = pending.get(msg.id);
        if (resolve) {
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch (_e) { /* ignore parse errors */ }
    }
  });

  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const msg = { jsonrpc: '2.0', id, method, params };
      const body = JSON.stringify(msg);
      const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;

      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
      }, 10000);

      pending.set(id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });

      child.stdin.write(frame);
    });
  }

  async function callTool(name, args) {
    const resp = await send('tools/call', { name, arguments: args });
    if (resp.error) throw new Error(`RPC error: ${resp.error.message}`);
    const result = resp.result;
    if (result && result.content && result.content[0]) {
      const text = result.content[0].text;
      try { return { parsed: JSON.parse(text), isError: result.isError || false }; }
      catch (_e) { return { parsed: text, isError: result.isError || false }; }
    }
    return { parsed: result, isError: false };
  }

  async function initialize() {
    return send('initialize', { protocolVersion: '2024-11-05' });
  }

  function close() {
    child.stdin.end();
    child.kill('SIGTERM');
  }

  return { send, callTool, initialize, close };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseResult(toolResult) {
  return toolResult.parsed;
}

// ── Test suite ──────────────────────────────────────────────────────────────

const SERVER_PATH = path.resolve(__dirname, '..', 'scope12-mcp.js');
let client;
let tmpDir;

describe('scope12-mcp.js', () => {
  before(async () => {
    // Create isolated temp data dir to avoid polluting real data
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope12-test-'));

    // Copy reference data files to temp dir
    const dataDir = path.resolve(__dirname, '..', '..', 'data');
    for (const f of ['gwp_ar5.json', 'gwp_ar6.json', 'grid_factors_2024.json', 'combustion_factors.json', 'refrigerant_gwp.json']) {
      const src = path.join(dataDir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(tmpDir, f));
      }
    }

    // The server reads DATA_DIR as path.resolve(__dirname, '..', 'data')
    // We can't override that without modifying the server, so we test against real data dir.
    // The store-adapter will write to that data dir, but we'll clean up test collections after.
    client = createMcpClient(SERVER_PATH);
    await client.initialize();
  });

  after(() => {
    if (client) client.close();
    // Clean up test collections from data dir
    const dataDir = path.resolve(__dirname, '..', '..', 'data');
    for (const f of fs.readdirSync(dataDir)) {
      if (f.startsWith('_test_') || f === 'closed_periods.json' || f === '_audit_log.json') {
        try { fs.unlinkSync(path.join(dataDir, f)); } catch (_e) { /* ignore */ }
      }
    }
    // Clean up tmpDir
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ── Health ──

  describe('scope12.health', () => {
    it('returns server info and reference data status', async () => {
      const { parsed } = await client.callTool('scope12.health', {});
      assert.strictEqual(parsed.plugin.name, 'scope12-accounting');
      assert.ok(parsed.timestamp);
      assert.strictEqual(parsed.reference_data.gwp_ar5, 'loaded');
      assert.strictEqual(parsed.reference_data.gwp_ar6, 'loaded');
      assert.strictEqual(parsed.reference_data.grid_factors, 'loaded');
      assert.strictEqual(parsed.reference_data.combustion_factors, 'loaded');
      assert.strictEqual(parsed.reference_data.refrigerant_gwp, 'loaded');
    });
  });

  // ── SHA-256 ──

  describe('scope12.sha256', () => {
    it('computes correct digest', async () => {
      const { parsed } = await client.callTool('scope12.sha256', { text: 'hello world' });
      assert.strictEqual(parsed, 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('rejects missing text', async () => {
      const { isError } = await client.callTool('scope12.sha256', {});
      assert.strictEqual(isError, true);
    });
  });

  // ── DB CRUD ──

  describe('DB CRUD', () => {
    const COLLECTION = '_test_scope12_crud';

    it('set + get + list + delete round-trip', async () => {
      // Set
      const { parsed: setResult } = await client.callTool('scope12.db.set', {
        collection: COLLECTION,
        doc: { _id: 'test-1', name: 'alpha', value: 42 },
      });
      assert.strictEqual(setResult.doc._id, 'test-1');
      assert.strictEqual(setResult.doc.name, 'alpha');

      // Get
      const { parsed: getResult } = await client.callTool('scope12.db.get', {
        collection: COLLECTION,
        query: { _id: 'test-1' },
      });
      assert.strictEqual(getResult.doc.name, 'alpha');

      // List
      const { parsed: listResult } = await client.callTool('scope12.db.list', {
        collection: COLLECTION,
      });
      assert.ok(listResult.count >= 1);

      // Delete
      const { parsed: delResult } = await client.callTool('scope12.db.delete', {
        collection: COLLECTION,
        query: { _id: 'test-1' },
      });
      assert.strictEqual(delResult.removed, 1);
    });

    it('delete rejects empty query', async () => {
      const { isError } = await client.callTool('scope12.db.delete', {
        collection: COLLECTION,
        query: {},
      });
      assert.strictEqual(isError, true);
    });

    it('bulkSet inserts multiple docs', async () => {
      const { parsed } = await client.callTool('scope12.db.bulkSet', {
        collection: '_test_scope12_bulk',
        docs: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      });
      assert.strictEqual(parsed.count, 3);

      // Cleanup
      await client.callTool('scope12.db.delete', { collection: '_test_scope12_bulk', query: { name: 'a' } });
      await client.callTool('scope12.db.delete', { collection: '_test_scope12_bulk', query: { name: 'b' } });
      await client.callTool('scope12.db.delete', { collection: '_test_scope12_bulk', query: { name: 'c' } });
    });
  });

  // ── Scope 1 Calculation ──

  describe('scope12.scope1.calculate', () => {
    it('stationary combustion: natural gas 1000 m3 AR5', async () => {
      const { parsed, isError } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'stationary_combustion', fuel: 'natural_gas', volume: 1000, unit: 'm3' }],
        gwp_version: 'ar5',
      });
      assert.strictEqual(isError, false);
      assert.strictEqual(parsed.gates_passed, true);

      // kgCO2 = 1000 * 1.885 = 1885; kgCH4 = 1000 * 0.000037 = 0.037; kgN2O = 1000 * 0.0000035 = 0.0035
      // CO2e = 1885*1 + 0.037*28 + 0.0035*265 = 1885 + 1.036 + 0.9275 = 1886.9635 kgCO2e = 1.8869635 tCO2e
      assert.ok(Math.abs(parsed.total_tco2e - 1.886964) < 0.001);
      assert.strictEqual(parsed.biogenic_tco2e, 0);
    });

    it('mobile combustion: diesel 500 liters', async () => {
      const { parsed } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'mobile_combustion', fuel: 'diesel_mobile', volume: 500, unit: 'liter' }],
        gwp_version: 'ar5',
      });
      assert.strictEqual(parsed.gates_passed, true);
      assert.ok(parsed.total_tco2e > 0);
      assert.ok(parsed.by_gas.CO2 > 0);
    });

    it('process emissions: CO2 from cement', async () => {
      const { parsed } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'process_emissions', activity_data: 1000, process_ef: 0.5, gas: 'CO2' }],
        gwp_version: 'ar5',
      });
      // 1000 * 0.5 * 1 (GWP CO2) = 500 kgCO2e = 0.5 tCO2e
      assert.ok(Math.abs(parsed.total_tco2e - 0.5) < 0.001);
    });

    it('fugitive emissions: R-410A refrigerant', async () => {
      const { parsed } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'fugitive_emissions', gas: 'R-410A', charge: 50, recovery_rate: 0.7 }],
        gwp_version: 'ar5',
      });
      // Leakage = 50 * (1-0.7) = 15 kg; GWP R-410A = 2088; 15 * 2088 = 31320 kgCO2e = 31.32 tCO2e
      assert.ok(Math.abs(parsed.total_tco2e - 31.32) < 0.01);
    });

    it('biogenic CO2 is tracked separately (wood pellets)', async () => {
      const { parsed } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'stationary_combustion', fuel: 'wood_pellets', volume: 1000, unit: 'kg' }],
        gwp_version: 'ar5',
      });
      assert.strictEqual(parsed.gates_passed, true);
      assert.ok(parsed.biogenic_tco2e > 0, 'biogenic should be tracked');
      // Wood pellets: kgCO2=0, kgCH4=0.0003, kgN2O=0.00004, kgCO2_bio=1.64
      // Fossil total = only CH4 + N2O GWP contributions; biogenic CO2 excluded from total
      assert.ok(parsed.total_tco2e < parsed.biogenic_tco2e, 'fossil total < biogenic for wood');
    });

    it('AR6 GWP version changes results', async () => {
      const { parsed: ar5 } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'stationary_combustion', fuel: 'natural_gas', volume: 10000, unit: 'm3' }],
        gwp_version: 'ar5',
      });
      const { parsed: ar6 } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'stationary_combustion', fuel: 'natural_gas', volume: 10000, unit: 'm3' }],
        gwp_version: 'ar6',
      });
      // AR5 CH4 GWP = 28, AR6 CH4 GWP = 27.9 -- slightly different
      assert.notStrictEqual(ar5.total_tco2e, ar6.total_tco2e);
    });

    it('multi-source aggregation', async () => {
      const { parsed } = await client.callTool('scope12.scope1.calculate', {
        sources: [
          { type: 'stationary_combustion', fuel: 'natural_gas', volume: 1000, unit: 'm3' },
          { type: 'mobile_combustion', fuel: 'diesel_mobile', volume: 500, unit: 'liter' },
          { type: 'fugitive_emissions', gas: 'R-134a', charge: 10, recovery_rate: 0.9 },
        ],
        gwp_version: 'ar5',
      });
      assert.strictEqual(parsed.gates_passed, true);
      assert.strictEqual(parsed.by_source.length, 3);
      // Total should be sum of all three
      const sumSources = parsed.by_source.reduce((s, src) => s + src.tco2e, 0);
      assert.ok(Math.abs(parsed.total_tco2e - sumSources) < 0.0001);
    });

    // ── Hard gates ──

    it('GATE: unknown unit fails', async () => {
      const { parsed } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'stationary_combustion', fuel: 'natural_gas', volume: 100, unit: 'gallons' }],
        gwp_version: 'ar5',
      });
      assert.ok(parsed.gate_failures.length > 0);
      assert.ok(parsed.gate_failures.some(g => g.gate === 'UNKNOWN_UNIT'));
      assert.strictEqual(parsed.gates_passed, false);
    });

    it('GATE: missing GWP fails for unknown gas', async () => {
      const { parsed } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'process_emissions', activity_data: 100, process_ef: 1, gas: 'UNOBTANIUM' }],
        gwp_version: 'ar5',
      });
      assert.ok(parsed.gate_failures.length > 0);
      assert.ok(parsed.gate_failures.some(g => g.gate === 'MISSING_GWP'));
    });

    it('GATE: proxy without waiver fails', async () => {
      const { parsed } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'stationary_combustion', fuel: 'natural_gas', volume: 100, unit: 'm3' }],
        gwp_version: 'ar5',
        uses_proxy: true,
      });
      assert.ok(parsed.gate_failures.some(g => g.gate === 'PROXY_WITHOUT_WAIVER'));
      assert.strictEqual(parsed.gates_passed, false);
    });

    it('GATE: DQ > 3.0 without waiver fails', async () => {
      const { parsed } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'stationary_combustion', fuel: 'natural_gas', volume: 100, unit: 'm3' }],
        gwp_version: 'ar5',
        dq_score: 3.5,
      });
      assert.ok(parsed.gate_failures.some(g => g.gate === 'DQ_SCORE'));
      assert.strictEqual(parsed.gates_passed, false);
    });

    it('GATE: DQ > 3.0 with waiver passes', async () => {
      const { parsed } = await client.callTool('scope12.scope1.calculate', {
        sources: [{ type: 'stationary_combustion', fuel: 'natural_gas', volume: 100, unit: 'm3' }],
        gwp_version: 'ar5',
        dq_score: 3.5,
        dq_waiver: true,
      });
      assert.ok(!parsed.gate_failures.some(g => g.gate === 'DQ_SCORE'));
    });
  });

  // ── Scope 2 Calculation ──

  describe('scope12.scope2.calculate', () => {
    it('location-based: US_AVERAGE 100,000 kWh', async () => {
      const { parsed } = await client.callTool('scope12.scope2.calculate', {
        entries: [{ grid_region: 'US_AVERAGE', kwh: 100000 }],
        method: 'location',
      });
      // 100000 * 0.386 = 38600 kgCO2e = 38.6 tCO2e
      assert.ok(Math.abs(parsed.location_based_tco2e - 38.6) < 0.01);
    });

    it('unit normalization: MWh to kWh', async () => {
      const { parsed } = await client.callTool('scope12.scope2.calculate', {
        entries: [{ grid_region: 'FR', kwh: 50, unit: 'MWh' }],
        method: 'location',
      });
      // 50 MWh = 50000 kWh; 50000 * 0.052 = 2600 kgCO2e = 2.6 tCO2e
      assert.ok(Math.abs(parsed.location_based_tco2e - 2.6) < 0.01);
    });

    it('unit normalization: GJ to kWh', async () => {
      const { parsed } = await client.callTool('scope12.scope2.calculate', {
        entries: [{ grid_region: 'UK', kwh: 100, unit: 'GJ' }],
        method: 'location',
      });
      // 100 GJ = 27777.8 kWh; 27777.8 * 0.207 = 5750.0046 kgCO2e
      assert.ok(parsed.location_based_tco2e > 5);
    });

    it('dual ledger: both methods', async () => {
      const { parsed } = await client.callTool('scope12.scope2.calculate', {
        entries: [{ grid_region: 'US_AVERAGE', kwh: 100000 }],
        method: 'both',
      });
      // LB should have value, MB = 0 (no instrument or residual_mix_ef)
      assert.ok(parsed.location_based_tco2e > 0);
      // Without any market instruments, MB uses FAIL path => 0
      assert.strictEqual(parsed.market_based_tco2e, 0);
    });

    it('market-based: contractual with owned_and_retired', async () => {
      const { parsed } = await client.callTool('scope12.scope2.calculate', {
        entries: [{
          grid_region: 'US_AVERAGE',
          kwh: 100000,
          instrument: { ef: 0.01, ownership_status: 'owned_and_retired', quantity_kwh: 80000 },
          residual_mix_ef: 0.3,
        }],
        method: 'market',
      });
      // Matched 80000 kWh * 0.01 = 800; Unmatched 20000 * 0.3 = 6000; Total = 6800 kgCO2e = 6.8 tCO2e
      assert.ok(Math.abs(parsed.market_based_tco2e - 6.8) < 0.01);
      assert.ok(parsed.method_hierarchy_applied.some(h => h.step === 'contractual'));
    });

    it('market-based: blocked ownership falls to residual mix', async () => {
      const { parsed } = await client.callTool('scope12.scope2.calculate', {
        entries: [{
          grid_region: 'US_AVERAGE',
          kwh: 100000,
          instrument: { ef: 0.01, ownership_status: 'pending' },
          residual_mix_ef: 0.25,
        }],
        method: 'market',
      });
      // Ownership not retired, falls to residual mix: 100000 * 0.25 = 25000 kgCO2e = 25 tCO2e
      assert.ok(Math.abs(parsed.market_based_tco2e - 25) < 0.01);
      assert.ok(parsed.method_hierarchy_applied.some(h => h.step === 'residual_mix'));
    });

    it('on-site generation reduces net import', async () => {
      const { parsed } = await client.callTool('scope12.scope2.calculate', {
        entries: [{
          grid_region: 'US_AVERAGE',
          kwh: 100000,
          on_site_generation_kwh: 30000,
        }],
        method: 'location',
      });
      // Net = 70000 kWh; 70000 * 0.386 = 27020 kgCO2e = 27.02 tCO2e
      assert.ok(Math.abs(parsed.location_based_tco2e - 27.02) < 0.01);
      assert.strictEqual(parsed.entries[0].net_import_kwh, 70000);
    });
  });

  // ── KPI Normalization ──

  describe('scope12.kpi.normalize', () => {
    it('computes all 5 KPIs', async () => {
      const { parsed } = await client.callTool('scope12.kpi.normalize', {
        total_tco2e: 500,
        revenue_musd: 100,
        units_produced: 50000,
        fte: 250,
        floor_area_m2: 10000,
        energy_mwh: 5000,
      });
      assert.strictEqual(parsed.kpis.revenue_intensity, 5);         // 500/100
      assert.strictEqual(parsed.kpis.unit_intensity, 10);            // 500*1000/50000
      assert.strictEqual(parsed.kpis.fte_intensity, 2);              // 500/250
      assert.strictEqual(parsed.kpis.floor_area_intensity, 50);      // 500*1000/10000
      assert.strictEqual(parsed.kpis.energy_intensity, 0.1);         // 500/5000
    });

    it('warns on coverage ratio < 0.80', async () => {
      const { parsed } = await client.callTool('scope12.kpi.normalize', {
        total_tco2e: 100,
        measured_total: 70,
        estimated_total: 100,
      });
      assert.ok(parsed.warnings.some(w => w.includes('WARN')));
      assert.ok(Math.abs(parsed.coverage_ratio - 0.7) < 0.01);
    });

    it('fails on coverage ratio < 0.50', async () => {
      const { parsed } = await client.callTool('scope12.kpi.normalize', {
        total_tco2e: 100,
        measured_total: 40,
        estimated_total: 100,
      });
      assert.ok(parsed.warnings.some(w => w.includes('FAIL')));
    });

    it('base-year indexing', async () => {
      const { parsed } = await client.callTool('scope12.kpi.normalize', {
        total_tco2e: 400,
        revenue_musd: 100,
        base_year_values: { revenue_intensity: 5 },
      });
      // Current intensity = 400/100 = 4; index = (4/5)*100 = 80
      assert.strictEqual(parsed.base_year_index.revenue_intensity, 80);
    });
  });

  // ── Report Export ──

  describe('scope12.report.export', () => {
    it('JSON format with tie-outs', async () => {
      const { parsed } = await client.callTool('scope12.report.export', {
        scope1_results: { total_tco2e: 100, biogenic_tco2e: 5, by_gas: { CO2: 90 } },
        scope2_results: { location_based_tco2e: 50, market_based_tco2e: 30 },
        format: 'json',
      });
      assert.strictEqual(parsed.tie_out.scope1_tco2e, 100);
      assert.strictEqual(parsed.tie_out.total_lb_tco2e, 150); // 100 + 50
      assert.strictEqual(parsed.tie_out.total_mb_tco2e, 130); // 100 + 30
    });

    it('summary format returns text', async () => {
      const { parsed } = await client.callTool('scope12.report.export', {
        scope1_results: { total_tco2e: 100 },
        scope2_results: { location_based_tco2e: 50, market_based_tco2e: 30 },
        format: 'summary',
      });
      assert.ok(typeof parsed === 'string');
      assert.ok(parsed.includes('Scope 1: 100 tCO2e'));
      assert.ok(parsed.includes('Total (Location-based): 150 tCO2e'));
    });
  });

  // ── Period Close ──

  describe('scope12.period.close', () => {
    it('closes a period and returns SHA-256', async () => {
      const period = `test-${Date.now()}`;
      const { parsed, isError } = await client.callTool('scope12.period.close', {
        period,
        org_id: 'TEST-ORG',
        closed_by: 'test-suite',
      });
      assert.strictEqual(isError, false);
      assert.strictEqual(parsed.status, 'CLOSED');
      assert.ok(parsed.sha256);
      assert.ok(parsed.sha256.length === 64);

      // Closing same period again should conflict
      const { isError: isError2 } = await client.callTool('scope12.period.close', {
        period,
        org_id: 'TEST-ORG',
      });
      assert.strictEqual(isError2, true);
    });

    it('rejects restatement with missing fields', async () => {
      const { isError, parsed } = await client.callTool('scope12.period.close', {
        period: `restate-${Date.now()}`,
        org_id: 'TEST-ORG',
        restatement: { approver: 'test' }, // missing 14 other fields
      });
      assert.strictEqual(isError, true);
      assert.ok(parsed.details.missing_fields.length > 0);
    });
  });

  // ── DQ Score ──

  describe('scope12.dq.score', () => {
    it('computes weighted score and grade', async () => {
      const { parsed } = await client.callTool('scope12.dq.score', {
        dimensions: { completeness: 1, accuracy: 1, consistency: 1, timeliness: 1, transparency: 1 },
      });
      assert.strictEqual(parsed.final_score, 1);
      assert.strictEqual(parsed.grade, 'HIGH');
    });

    it('LOW grade for high scores (bad quality)', async () => {
      const { parsed } = await client.callTool('scope12.dq.score', {
        dimensions: { completeness: 4, accuracy: 4, consistency: 4, timeliness: 4, transparency: 4 },
      });
      assert.strictEqual(parsed.final_score, 4);
      assert.strictEqual(parsed.grade, 'LOW');
    });

    it('rejects invalid dimension values', async () => {
      const { isError } = await client.callTool('scope12.dq.score', {
        dimensions: { completeness: 0, accuracy: 6, consistency: 2, timeliness: 2, transparency: 2 },
      });
      assert.strictEqual(isError, true);
    });
  });

  // ── Evidence Validate ──

  describe('scope12.evidence.validate', () => {
    it('validates complete evidence', async () => {
      const { parsed } = await client.callTool('scope12.evidence.validate', {
        evidence: {
          certificate_id: 'CERT-001',
          issuer: 'GreenPower',
          generation_source: 'wind',
          generation_period_start: '2024-01-01',
          generation_period_end: '2024-12-31',
          generation_mwh: 5000,
          technology: 'onshore_wind',
          location: 'Texas, US',
          grid_region: 'US_ERCOT',
          retirement_date: '2025-01-15',
          retirement_registry: 'M-RETS',
          ownership_status: 'owned_and_retired',
          beneficiary: 'TestCorp',
          vintage_year: 2024,
          tracking_system: 'M-RETS',
          verification_standard: 'Green-e',
        },
      });
      assert.strictEqual(parsed.valid, true);
      assert.strictEqual(parsed.missing_fields.length, 0);
      assert.strictEqual(parsed.gate_failures.length, 0);
    });

    it('flags missing required fields', async () => {
      const { parsed } = await client.callTool('scope12.evidence.validate', {
        evidence: {
          certificate_id: 'CERT-002',
          issuer: 'SolarCo',
          ownership_status: 'owned_and_retired',
        },
      });
      assert.strictEqual(parsed.valid, false);
      assert.ok(parsed.missing_fields.length > 0);
      assert.ok(parsed.missing_fields.includes('generation_source'));
    });

    it('GATE: ownership_status not owned_and_retired', async () => {
      const { parsed } = await client.callTool('scope12.evidence.validate', {
        evidence: {
          certificate_id: 'CERT-003',
          issuer: 'WindCo',
          generation_source: 'wind',
          generation_period_start: '2024-01-01',
          generation_period_end: '2024-12-31',
          generation_mwh: 1000,
          technology: 'offshore_wind',
          location: 'North Sea',
          grid_region: 'UK',
          retirement_date: '2025-02-01',
          retirement_registry: 'Ofgem',
          ownership_status: 'pending_transfer',
          beneficiary: 'TestCorp',
          vintage_year: 2024,
          tracking_system: 'Ofgem',
          verification_standard: 'REGO',
        },
      });
      assert.strictEqual(parsed.valid, false);
      assert.ok(parsed.gate_failures.some(g => g.gate === 'OWNERSHIP_STATUS'));
    });
  });
});
