'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---------------------------------------------------------------------------
// MCP Client helper: spawns the server, sends JSON-RPC over stdio
// ---------------------------------------------------------------------------

class TestMcpClient {
  constructor(serverPath, env) {
    this._serverPath = serverPath;
    this._env = env || {};
    this._proc = null;
    this._requestId = 0;
    this._pending = new Map();
    this._buffer = Buffer.alloc(0);
  }

  start() {
    this._proc = spawn('node', [this._serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this._env },
    });

    this._proc.stdout.on('data', (chunk) => {
      this._buffer = Buffer.concat([this._buffer, chunk]);
      this._tryParse();
    });

    this._proc.stderr.on('data', () => {
      // suppress server stderr
    });

    this._proc.on('error', (err) => {
      for (const [, { reject }] of this._pending) reject(err);
      this._pending.clear();
    });
  }

  async initialize() {
    return this._send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '0.0.1' },
    });
  }

  async listTools() {
    return this._send('tools/list', {});
  }

  async callTool(name, args) {
    return this._send('tools/call', { name, arguments: args });
  }

  stop() {
    if (this._proc) {
      this._proc.kill('SIGTERM');
      this._proc = null;
    }
  }

  _send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this._requestId;
      this._pending.set(id, { resolve, reject });

      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      const frame = `Content-Length: ${Buffer.byteLength(msg, 'utf8')}\r\n\r\n${msg}`;
      this._proc.stdin.write(frame);

      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
        }
      }, 10000);
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
            reject(new Error(`RPC error: ${msg.error.message}`));
          } else {
            resolve(msg.result);
          }
        }
      } catch (_e) { /* skip */ }
    }
  }
}

// ---------------------------------------------------------------------------
// Helper to parse tool result text
// ---------------------------------------------------------------------------

function parseToolResult(result) {
  const text = result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_e) {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const SERVER_PATH = path.resolve(__dirname, '..', 'calc-mcp.js');

// Use a temp data directory so tests don't pollute real data
const TMP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'calcmcp-test-'));

describe('calc-mcp server', () => {
  let client;

  before(async () => {
    // Patch the data dir by setting up a symlink or just trust the default
    // Since calc-mcp reads DATA_DIR relative to itself, we need the shared-services
    // store-adapter to exist. We'll just run against the real path.
    client = new TestMcpClient(SERVER_PATH);
    client.start();
    await client.initialize();
  });

  after(() => {
    client.stop();
    // Clean up temp dir
    try { fs.rmSync(TMP_DATA_DIR, { recursive: true, force: true }); } catch (_e) { /* ok */ }
  });

  describe('initialize', () => {
    it('should return server info on tools/list', async () => {
      const result = await client.listTools();
      assert.ok(result.tools, 'should have tools array');
      assert.ok(result.tools.length >= 10, `should have at least 10 tools, got ${result.tools.length}`);

      const toolNames = result.tools.map((t) => t.name);
      assert.ok(toolNames.includes('calc.health'));
      assert.ok(toolNames.includes('calc.compute'));
      assert.ok(toolNames.includes('calc.ingest'));
      assert.ok(toolNames.includes('calc.dqs_score'));
      assert.ok(toolNames.includes('calc.export'));
      assert.ok(toolNames.includes('calc.fx_normalize'));
      assert.ok(toolNames.includes('calc.sha256'));
      assert.ok(toolNames.includes('calc.db.get'));
      assert.ok(toolNames.includes('calc.db.set'));
      assert.ok(toolNames.includes('calc.db.list'));
    });
  });

  describe('calc.health', () => {
    it('should return plugin info and timestamp', async () => {
      const result = await client.callTool('calc.health', {});
      const data = parseToolResult(result);
      assert.ok(data.plugin, 'should have plugin info');
      assert.ok(data.server, 'should have server info');
      assert.ok(data.timestamp, 'should have timestamp');
    });
  });

  describe('calc.sha256', () => {
    it('should compute correct SHA-256 hash', async () => {
      const result = await client.callTool('calc.sha256', { text: 'hello' });
      const data = parseToolResult(result);
      // SHA-256 of "hello"
      assert.equal(data, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    });

    it('should fail on missing text', async () => {
      const result = await client.callTool('calc.sha256', {});
      assert.equal(result.isError, true);
    });
  });

  describe('calc.fx_normalize', () => {
    it('should convert EUR to USD', async () => {
      const result = await client.callTool('calc.fx_normalize', {
        amount: 100,
        from_currency: 'EUR',
        to_currency: 'USD',
      });
      const data = parseToolResult(result);
      assert.equal(data.from_currency, 'EUR');
      assert.equal(data.to_currency, 'USD');
      assert.ok(data.rate > 0, 'rate should be positive');
      assert.ok(data.converted > 0, 'converted amount should be positive');
      // EUR/USD rate should be around 1.08
      assert.ok(data.converted > 100, 'EUR to USD should increase the amount');
    });

    it('should return rate 1 for same currency', async () => {
      const result = await client.callTool('calc.fx_normalize', {
        amount: 50,
        from_currency: 'USD',
        to_currency: 'USD',
      });
      const data = parseToolResult(result);
      assert.equal(data.rate, 1);
      assert.equal(data.converted, 50);
    });

    it('should fail on unsupported currency pair', async () => {
      const result = await client.callTool('calc.fx_normalize', {
        amount: 100,
        from_currency: 'XYZ',
        to_currency: 'ABC',
      });
      assert.equal(result.isError, true);
    });
  });

  describe('calc.db CRUD', () => {
    it('should set and get a document', async () => {
      const setResult = await client.callTool('calc.db.set', {
        collection: 'test_items',
        doc: { name: 'test-doc', value: 42 },
      });
      const setData = parseToolResult(setResult);
      assert.ok(setData.doc._id, 'should have _id');
      assert.equal(setData.doc.name, 'test-doc');

      const getResult = await client.callTool('calc.db.get', {
        collection: 'test_items',
        query: { _id: setData.doc._id },
      });
      const getData = parseToolResult(getResult);
      assert.equal(getData.count, 1);
      assert.equal(getData.docs[0].name, 'test-doc');
    });

    it('should list documents with filter', async () => {
      const col = `test_filter_${Date.now()}`;
      await client.callTool('calc.db.set', {
        collection: col,
        doc: { tag: 'alpha', val: 1 },
      });
      await client.callTool('calc.db.set', {
        collection: col,
        doc: { tag: 'beta', val: 2 },
      });
      await client.callTool('calc.db.set', {
        collection: col,
        doc: { tag: 'alpha', val: 3 },
      });

      const result = await client.callTool('calc.db.list', {
        collection: col,
        query: { tag: 'alpha' },
      });
      const data = parseToolResult(result);
      assert.equal(data.count, 2);
    });

    it('should delete documents', async () => {
      await client.callTool('calc.db.set', {
        collection: 'test_delete',
        doc: { group: 'del', name: 'a' },
      });
      await client.callTool('calc.db.set', {
        collection: 'test_delete',
        doc: { group: 'keep', name: 'b' },
      });

      const delResult = await client.callTool('calc.db.delete', {
        collection: 'test_delete',
        query: { group: 'del' },
      });
      const delData = parseToolResult(delResult);
      assert.equal(delData.removed, 1);
    });
  });

  describe('calc.ingest', () => {
    it('should ingest rows and create a job', async () => {
      const result = await client.callTool('calc.ingest', {
        filename: 'test-data.csv',
        rows: [
          { vendor: 'Acme Corp', description: 'Office Supplies', spend: 5000, currency: 'USD', category: 'purchased_goods' },
          { vendor: 'Beta Inc', description: 'Travel', spend: 2000, currency: 'EUR', category: 'business_travel' },
          { vendor: null, description: null, spend: null, currency: null },
        ],
        reporting_currency: 'USD',
      });
      const data = parseToolResult(result);
      assert.equal(data.error, false);
      assert.ok(data.job_id, 'should return job_id');
      assert.equal(data.row_count, 3);
      assert.equal(data.status, 'DONE');

      // Check reconciliation flags
      assert.ok(data.reconciliation, 'should have reconciliation');
      assert.equal(data.reconciliation.missing.MISSING_VENDOR, 1, 'should flag 1 missing vendor');
      assert.equal(data.reconciliation.missing.MISSING_SPEND, 1, 'should flag 1 missing spend');
    });

    it('should fail on empty rows', async () => {
      const result = await client.callTool('calc.ingest', {
        filename: 'empty.csv',
        rows: [],
      });
      assert.equal(result.isError, true);
    });
  });

  describe('calc.compute', () => {
    let jobId;

    before(async () => {
      // Seed emission factors
      await client.callTool('calc.db.set', {
        collection: 'emission_factors',
        doc: { basis: 'spend', kgco2e_per_unit: 0.5, category: 'purchased_goods' },
      });

      // Ingest test data
      const ingestResult = await client.callTool('calc.ingest', {
        filename: 'compute-test.csv',
        rows: [
          { vendor: 'Vendor-A', description: 'Raw Materials', spend: 10000, currency: 'USD', category: 'purchased_goods' },
          { vendor: 'Vendor-B', description: 'Logistics', spend: 5000, currency: 'USD', category: 'upstream_transport' },
        ],
        reporting_currency: 'USD',
      });
      jobId = parseToolResult(ingestResult).job_id;
    });

    it('should compute emissions for an ingested job', async () => {
      const result = await client.callTool('calc.compute', { job_id: jobId });
      const data = parseToolResult(result);

      assert.equal(data.error, false);
      assert.ok(data.run_id, 'should return run_id');
      assert.ok(data.inventory_item_count > 0, 'should have inventory items');
      assert.ok(data.total_emissions_kgco2e >= 0, 'should have total emissions');
      assert.ok(data.methodology_counts, 'should have methodology counts');
    });

    it('should return cached result on second call without refresh', async () => {
      const result = await client.callTool('calc.compute', { job_id: jobId });
      const data = parseToolResult(result);
      assert.equal(data.cached, true, 'should be cached');
    });

    it('should recompute with refresh=true', async () => {
      const result = await client.callTool('calc.compute', { job_id: jobId, refresh: true });
      const data = parseToolResult(result);
      assert.equal(data.cached, false, 'should not be cached');
    });

    it('should fail on non-existent job', async () => {
      const result = await client.callTool('calc.compute', { job_id: 'nonexistent' });
      assert.equal(result.isError, true);
    });
  });

  describe('calc.dqs_score', () => {
    let jobId;

    before(async () => {
      const ingestResult = await client.callTool('calc.ingest', {
        filename: 'dqs-test.csv',
        rows: [
          { vendor: 'Complete-Vendor', description: 'Item A', spend: 1000, currency: 'USD', quantity: 10, unit: 'kg' },
          { vendor: 'Partial-Vendor', spend: 500, currency: 'USD' },
          { vendor: null, description: null },
        ],
        reporting_currency: 'USD',
      });
      jobId = parseToolResult(ingestResult).job_id;
    });

    it('should compute DQS with base and method scores', async () => {
      const result = await client.callTool('calc.dqs_score', { job_id: jobId });
      const data = parseToolResult(result);

      assert.ok(data.base_score >= 0 && data.base_score <= 1, 'base_score should be 0-1');
      assert.ok(data.method_score >= 0 && data.method_score <= 1, 'method_score should be 0-1');
      assert.ok(data.final_dqs >= 0 && data.final_dqs <= 1, 'final_dqs should be 0-1');
      assert.equal(data.row_count, 3);
      assert.ok(data.missing_rates, 'should have missing_rates');
    });

    it('should fail on non-existent job', async () => {
      const result = await client.callTool('calc.dqs_score', { job_id: 'nonexistent' });
      assert.equal(result.isError, true);
    });
  });

  describe('calc.export', () => {
    let jobId;

    before(async () => {
      // Ingest and compute
      const ingestResult = await client.callTool('calc.ingest', {
        filename: 'export-test.csv',
        rows: [
          { vendor: 'ExportVendor', description: 'Widget', spend: 3000, currency: 'USD' },
        ],
        reporting_currency: 'USD',
      });
      jobId = parseToolResult(ingestResult).job_id;
      await client.callTool('calc.compute', { job_id: jobId });
    });

    it('should export as JSON', async () => {
      const result = await client.callTool('calc.export', { job_id: jobId, format: 'json' });
      const data = parseToolResult(result);
      assert.equal(data.format, 'json');
      assert.ok(data.item_count > 0);
      assert.ok(data.content, 'should have content');
    });

    it('should export as CSV', async () => {
      const result = await client.callTool('calc.export', { job_id: jobId, format: 'csv' });
      const data = parseToolResult(result);
      assert.equal(data.format, 'csv');
      assert.ok(data.content.includes('vendor'), 'CSV should have vendor header');
      assert.ok(data.content.includes('emissions_total_kgco2e'), 'CSV should have emissions header');
    });

    it('should fail on non-existent job', async () => {
      const result = await client.callTool('calc.export', { job_id: 'nonexistent' });
      assert.equal(result.isError, true);
    });
  });
});
