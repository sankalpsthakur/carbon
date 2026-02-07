'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

// ── MCP test client (stdio JSON-RPC 2.0 with LSP framing) ───────────────────
function createMcpClient(serverPath) {
  const child = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env },
  });
  let buffer = Buffer.alloc(0);
  const pending = new Map();
  let nextId = 1;
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length > 0) {
      let headerEnd = buffer.indexOf('\r\n\r\n'), sepLen = 4;
      if (headerEnd === -1) { headerEnd = buffer.indexOf('\n\n'); sepLen = 2; }
      if (headerEnd === -1) return;
      const hdr = buffer.slice(0, headerEnd).toString('utf8');
      const m = /content-length\s*:\s*(\d+)/i.exec(hdr);
      if (!m) { buffer = buffer.slice(headerEnd + sepLen); continue; }
      const bodyLen = parseInt(m[1], 10), bodyStart = headerEnd + sepLen;
      if (buffer.length < bodyStart + bodyLen) return;
      const body = buffer.slice(bodyStart, bodyStart + bodyLen).toString('utf8');
      buffer = buffer.slice(bodyStart + bodyLen);
      try {
        const msg = JSON.parse(body);
        const cb = pending.get(msg.id);
        if (cb) { pending.delete(msg.id); cb(msg); }
      } catch (_e) { /* ignore */ }
    }
  });
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000);
      pending.set(id, (r) => { clearTimeout(timer); resolve(r); });
      child.stdin.write(frame);
    });
  }
  async function callTool(name, args) {
    const resp = await send('tools/call', { name, arguments: args || {} });
    if (resp.error) throw new Error(`RPC error: ${resp.error.message}`);
    const result = resp.result;
    if (result && result.content && result.content[0]) {
      const text = result.content[0].text;
      try { return { parsed: JSON.parse(text), isError: result.isError || false }; }
      catch (_e) { return { parsed: text, isError: result.isError || false }; }
    }
    return { parsed: result, isError: false };
  }
  return {
    send, callTool,
    initialize: () => send('initialize', { protocolVersion: '2024-11-05' }),
    close: () => { child.stdin.end(); child.kill('SIGTERM'); },
  };
}

// ── Test suite ──────────────────────────────────────────────────────────────
const SERVER_PATH = path.resolve(__dirname, '..', 'connectors-mcp.js');
const TEST_COL = '_test_connectors';
let client;

// Helper: full generic-csv row (all 8 canonical fields)
const csvRow = (v, a) => ({
  vendor: v, amount: String(a), currency: 'USD', quantity: '10', unit: 'kg',
  category: 'supplies', date: '2025-01-15', org_unit: 'HQ',
});

describe('connectors-mcp.js', () => {
  before(async () => { client = createMcpClient(SERVER_PATH); await client.initialize(); });
  after(() => {
    if (client) client.close();
    const dir = path.resolve(__dirname, '..', '..', 'data');
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith('_test_')) try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
      }
    }
  });

  // ── tools/list ──
  describe('tools/list', () => {
    it('returns all 10 connector tools with descriptions and schemas', async () => {
      const resp = await client.send('tools/list', {});
      const tools = resp.result.tools;
      assert.ok(Array.isArray(tools));
      assert.strictEqual(tools.length, 10);
      const names = tools.map((t) => t.name);
      for (const n of [
        'connectors.health', 'connectors.list', 'connectors.map', 'connectors.ingest',
        'connectors.validate', 'connectors.preview',
        'connectors.db.get', 'connectors.db.set', 'connectors.db.delete', 'connectors.db.list',
      ]) assert.ok(names.includes(n), `missing tool: ${n}`);
      for (const t of tools) {
        assert.ok(typeof t.description === 'string' && t.description.length > 0);
        assert.ok(t.inputSchema && typeof t.inputSchema === 'object');
      }
    });
  });

  // ── Health ──
  describe('connectors.health', () => {
    it('returns plugin/server info, config count, and directory paths', async () => {
      const { parsed, isError } = await client.callTool('connectors.health');
      assert.strictEqual(isError, false);
      assert.ok(parsed.plugin && parsed.plugin.name && parsed.plugin.version);
      assert.ok(parsed.server && parsed.server.name);
      assert.ok(parsed.timestamp);
      assert.ok(typeof parsed.available_configs === 'number' && parsed.available_configs >= 1);
      assert.ok(Array.isArray(parsed.configs));
      assert.ok(typeof parsed.data_dir === 'string');
      assert.ok(typeof parsed.mappings_dir === 'string');
    });
  });

  // ── connectors.list ──
  describe('connectors.list', () => {
    it('lists configs with metadata and includes known connectors', async () => {
      const { parsed, isError } = await client.callTool('connectors.list');
      assert.strictEqual(isError, false);
      assert.ok(typeof parsed.count === 'number' && parsed.count >= 1);
      assert.ok(Array.isArray(parsed.configs));
      for (const cfg of parsed.configs) {
        for (const k of ['source', 'version', 'api_type', 'auth_type', 'file'])
          assert.ok(typeof cfg[k] === 'string', `config missing ${k}`);
      }
      const sources = parsed.configs.map((c) => c.source);
      for (const s of ['generic-csv', 'xero', 'sap-s4hana'])
        assert.ok(sources.includes(s), `missing ${s}`);
    });
  });

  // ── DB CRUD cycle ──
  describe('connectors.db CRUD', () => {
    const docName = `crud-${Date.now()}`;

    it('db.set creates a document with _id and timestamps', async () => {
      const { parsed, isError } = await client.callTool('connectors.db.set', {
        collection: TEST_COL, doc: { name: docName, type: 'erp', status: 'active' },
      });
      assert.strictEqual(isError, false);
      assert.ok(parsed.doc._id);
      assert.strictEqual(parsed.doc.name, docName);
      assert.ok(parsed.doc._created_at && parsed.doc._updated_at);
      assert.strictEqual(parsed.collection, TEST_COL);
    });

    it('db.get retrieves documents by query', async () => {
      const { parsed } = await client.callTool('connectors.db.get', {
        collection: TEST_COL, query: { name: docName },
      });
      assert.strictEqual(parsed.count, 1);
      assert.strictEqual(parsed.docs[0].name, docName);
      assert.strictEqual(parsed.docs[0].type, 'erp');
    });

    it('db.set upserts an existing document by _id', async () => {
      const { parsed: g } = await client.callTool('connectors.db.get', {
        collection: TEST_COL, query: { name: docName },
      });
      const { parsed } = await client.callTool('connectors.db.set', {
        collection: TEST_COL,
        doc: { _id: g.docs[0]._id, name: docName, type: 'erp', status: 'updated' },
      });
      assert.strictEqual(parsed.doc._id, g.docs[0]._id);
      assert.strictEqual(parsed.doc.status, 'updated');
    });

    it('db.list returns all docs, respects limit and query filter', async () => {
      await client.callTool('connectors.db.set', {
        collection: TEST_COL, doc: { name: `extra-${Date.now()}`, type: 'csv' },
      });
      const { parsed: all } = await client.callTool('connectors.db.list', { collection: TEST_COL });
      assert.ok(all.count >= 2);
      assert.strictEqual(all.collection, TEST_COL);

      const { parsed: lim } = await client.callTool('connectors.db.list', {
        collection: TEST_COL, limit: 1,
      });
      assert.strictEqual(lim.docs.length, 1);

      const { parsed: filt } = await client.callTool('connectors.db.list', {
        collection: TEST_COL, query: { type: 'erp' },
      });
      assert.ok(filt.docs.every((d) => d.type === 'erp'));
    });

    it('db.delete removes matching documents', async () => {
      const { parsed } = await client.callTool('connectors.db.delete', {
        collection: TEST_COL, query: { name: docName },
      });
      assert.ok(parsed.removed >= 1);
      const { parsed: after } = await client.callTool('connectors.db.get', {
        collection: TEST_COL, query: { name: docName },
      });
      assert.strictEqual(after.count, 0);
    });

    it('db.get returns empty for nonexistent query', async () => {
      const { parsed } = await client.callTool('connectors.db.get', {
        collection: TEST_COL, query: { name: 'does-not-exist' },
      });
      assert.strictEqual(parsed.count, 0);
      assert.deepStrictEqual(parsed.docs, []);
    });

    it('db.set rejects missing doc', async () => {
      const { isError } = await client.callTool('connectors.db.set', { collection: TEST_COL });
      assert.strictEqual(isError, true);
    });

    it('db.delete rejects missing query', async () => {
      const { isError } = await client.callTool('connectors.db.delete', { collection: TEST_COL });
      assert.strictEqual(isError, true);
    });

    it('db.get rejects missing collection', async () => {
      const { isError } = await client.callTool('connectors.db.get', {});
      assert.strictEqual(isError, true);
    });
  });

  // ── connectors.validate ──
  describe('connectors.validate', () => {
    it('validates a complete row with no issues', async () => {
      const { parsed, isError } = await client.callTool('connectors.validate', {
        source: 'generic-csv', rows: [csvRow('Acme Corp', 5000)],
      });
      assert.strictEqual(isError, false);
      assert.strictEqual(parsed.source, 'generic-csv');
      assert.strictEqual(parsed.total_rows, 1);
      assert.strictEqual(parsed.clean_rows, 1);
      assert.strictEqual(parsed.rows_with_issues, 0);
    });

    it('flags rows with missing required fields', async () => {
      const { parsed } = await client.callTool('connectors.validate', {
        source: 'generic-csv', rows: [{ category: 'logistics' }],
      });
      assert.strictEqual(parsed.rows_with_issues, 1);
      assert.strictEqual(parsed.clean_rows, 0);
      assert.ok(Object.keys(parsed.field_summary).length >= 4);
    });

    it('counts clean vs issue rows in a batch', async () => {
      const { parsed } = await client.callTool('connectors.validate', {
        source: 'generic-csv',
        rows: [csvRow('Good', 1000), { vendor: '', amount: null, currency: '', date: '' }, csvRow('Also Good', 500)],
      });
      assert.strictEqual(parsed.total_rows, 3);
      assert.ok(parsed.clean_rows >= 1);
      assert.ok(parsed.rows_with_issues >= 1);
    });

    it('rejects unknown source', async () => {
      const { isError } = await client.callTool('connectors.validate', {
        source: 'nonexistent', rows: [{ vendor: 'X' }],
      });
      assert.strictEqual(isError, true);
    });

    it('rejects missing source or rows', async () => {
      const { isError: e1 } = await client.callTool('connectors.validate', { rows: [{ vendor: 'X' }] });
      assert.strictEqual(e1, true);
      const { isError: e2 } = await client.callTool('connectors.validate', { source: 'generic-csv' });
      assert.strictEqual(e2, true);
    });
  });

  // ── connectors.map ──
  describe('connectors.map', () => {
    it('maps generic-csv spend data with transforms', async () => {
      const { parsed, isError } = await client.callTool('connectors.map', {
        source: 'generic-csv',
        rows: [{
          vendor: 'CloudCo', amount: '12500.50', currency: 'usd', quantity: '1',
          unit: 'license', category: 'cloud_hosting', date: '2025-03-15T00:00:00Z', org_unit: 'Eng',
        }],
      });
      assert.strictEqual(isError, false);
      assert.strictEqual(parsed.total_rows, 1);
      assert.strictEqual(parsed.success_count, 1);
      assert.strictEqual(parsed.error_count, 0);
      const row = parsed.mapped_rows[0];
      assert.strictEqual(row.vendor, 'CloudCo');
      assert.strictEqual(row.amount, 12500.50);   // to_number
      assert.strictEqual(row.currency, 'USD');     // iso4217_validate
      assert.strictEqual(row.quantity, 1);         // to_number
      assert.strictEqual(row.org_unit, 'Eng');
    });

    it('maps xero-format data with nested field paths', async () => {
      const { parsed } = await client.callTool('connectors.map', {
        source: 'xero',
        rows: [{
          Contact: { Name: 'Xero Ltd' }, UnitAmount: 750, CurrencyCode: 'GBP',
          Quantity: 10, UnitOfMeasure: 'hours', AccountCode: '6100',
          DateString: '2025-07-01', TrackingCategory: 'London',
        }],
      });
      assert.strictEqual(parsed.success_count, 1);
      const row = parsed.mapped_rows[0];
      assert.strictEqual(row.vendor, 'Xero Ltd');
      assert.strictEqual(row.amount, 750);
      assert.strictEqual(row.currency, 'GBP');
    });

    it('maps batch of 5 rows and reports stats', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({
        vendor: `V-${i}`, amount: `${(i + 1) * 1000}`, currency: 'EUR', date: `2025-0${i + 1}-01`,
      }));
      const { parsed } = await client.callTool('connectors.map', { source: 'generic-csv', rows });
      assert.strictEqual(parsed.total_rows, 5);
      assert.strictEqual(parsed.success_count, 5);
      assert.strictEqual(parsed.mapped_rows.length, 5);
    });

    it('sets non-numeric amount to null without crashing', async () => {
      const { parsed, isError } = await client.callTool('connectors.map', {
        source: 'generic-csv',
        rows: [{ vendor: 'BadNum', amount: 'NaN', currency: 'USD', date: '2025-01-01' }],
      });
      assert.strictEqual(isError, false);
      assert.strictEqual(parsed.mapped_rows[0].amount, null);
    });

    it('rejects unknown source, missing source, or missing rows', async () => {
      const { isError: e1 } = await client.callTool('connectors.map', { source: 'no', rows: [{}] });
      assert.strictEqual(e1, true);
      const { isError: e2 } = await client.callTool('connectors.map', { rows: [{ vendor: 'X' }] });
      assert.strictEqual(e2, true);
      const { isError: e3 } = await client.callTool('connectors.map', { source: 'generic-csv' });
      assert.strictEqual(e3, true);
    });
  });

  // ── connectors.preview ──
  describe('connectors.preview', () => {
    it('returns dry-run preview with canonical and activity rows', async () => {
      const { parsed, isError } = await client.callTool('connectors.preview', {
        source: 'generic-csv',
        rows: [
          { vendor: 'Preview Corp', amount: '9999', currency: 'JPY', date: '2025-04-01' },
          { vendor: 'Preview Inc', amount: '5555', currency: 'CHF', date: '2025-05-01' },
        ],
      });
      assert.strictEqual(isError, false);
      assert.ok(parsed.preview_count >= 1);
      assert.ok(Array.isArray(parsed.canonical_rows));
      assert.ok(Array.isArray(parsed.activity_rows));
      assert.strictEqual(parsed.source, 'generic-csv');
    });

    it('respects limit parameter and defaults to 5', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => csvRow(`V${i}`, i * 100));
      const { parsed: p3 } = await client.callTool('connectors.preview', {
        source: 'generic-csv', rows, limit: 3,
      });
      assert.ok(p3.preview_count <= 3);
      const { parsed: p5 } = await client.callTool('connectors.preview', {
        source: 'generic-csv', rows,
      });
      assert.ok(p5.preview_count <= 5);
    });

    it('includes mapping config metadata', async () => {
      const { parsed } = await client.callTool('connectors.preview', {
        source: 'generic-csv', rows: [csvRow('Meta', 100)],
      });
      assert.ok(parsed.mapping_config && parsed.mapping_config.fields);
    });

    it('activity_rows use calc-mcp format', async () => {
      const { parsed } = await client.callTool('connectors.preview', {
        source: 'generic-csv',
        rows: [{ vendor: 'Act Corp', amount: '2500', currency: 'GBP', category: 'travel',
                 date: '2025-08-01', org_unit: 'Sales' }],
      });
      const ar = parsed.activity_rows[0];
      assert.strictEqual(ar.vendor, 'Act Corp');
      assert.strictEqual(ar.spend_original, 2500);
      assert.strictEqual(ar.currency_original, 'GBP');
      assert.strictEqual(ar.category, 'travel');
      assert.strictEqual(ar.org_unit, 'Sales');
    });

    it('rejects unknown source', async () => {
      const { isError } = await client.callTool('connectors.preview', {
        source: 'nonexistent', rows: [{ vendor: 'X' }],
      });
      assert.strictEqual(isError, true);
    });
  });

  // ── connectors.ingest ──
  describe('connectors.ingest', () => {
    it('maps rows to activity_rows and logs ingestion', async () => {
      const { parsed, isError } = await client.callTool('connectors.ingest', {
        source: 'generic-csv',
        rows: [{
          vendor: 'Ingest Supplier', amount: '7500', currency: 'EUR', quantity: '50',
          unit: 'kg', category: 'raw_materials', date: '2025-06-15', org_unit: 'Mfg',
        }],
        filename: 'test-spend-q2.csv',
      });
      assert.strictEqual(isError, false);
      assert.strictEqual(parsed.source, 'generic-csv');
      assert.strictEqual(parsed.mapping_result.total_rows, 1);
      assert.strictEqual(parsed.mapping_result.success_count, 1);
      assert.strictEqual(parsed.activity_row_count, 1);
      const ar = parsed.activity_rows[0];
      assert.strictEqual(ar.vendor, 'Ingest Supplier');
      assert.strictEqual(ar.spend_original, 7500);
      assert.strictEqual(ar.currency_original, 'EUR');
      assert.strictEqual(ar.quantity, 50);
      assert.strictEqual(ar.unit, 'kg');
      assert.ok(parsed.log_id && parsed.note);
    });

    it('creates verifiable ingestion_log entry', async () => {
      const { parsed: ir } = await client.callTool('connectors.ingest', {
        source: 'generic-csv',
        rows: [{ vendor: 'LogTest', amount: '100', currency: 'USD', date: '2025-01-01' }],
        filename: 'log-test.csv',
      });
      const { parsed: log } = await client.callTool('connectors.db.get', {
        collection: 'ingestion_log', query: { _id: ir.log_id },
      });
      assert.strictEqual(log.count, 1);
      assert.strictEqual(log.docs[0].source, 'generic-csv');
      assert.strictEqual(log.docs[0].filename, 'log-test.csv');
      assert.strictEqual(log.docs[0].total_rows, 1);
    });

    it('handles mixed-quality multi-row batch', async () => {
      const { parsed } = await client.callTool('connectors.ingest', {
        source: 'generic-csv',
        rows: [
          { vendor: 'Good', amount: '1000', currency: 'USD', date: '2025-01-01' },
          { vendor: 'BadAmt', amount: 'invalid', currency: 'EUR', date: '2025-02-01' },
          { vendor: 'AlsoGood', amount: '2000', currency: 'GBP', date: '2025-03-01' },
        ],
      });
      assert.strictEqual(parsed.mapping_result.total_rows, 3);
      assert.ok(parsed.activity_row_count >= 2);
    });

    it('rejects unknown source or missing rows', async () => {
      const { isError: e1 } = await client.callTool('connectors.ingest', {
        source: 'nonexistent', rows: [{ vendor: 'X' }],
      });
      assert.strictEqual(e1, true);
      const { isError: e2 } = await client.callTool('connectors.ingest', { source: 'generic-csv' });
      assert.strictEqual(e2, true);
    });
  });

  // ── SAP S/4HANA mapping ──
  describe('connectors.map with sap-s4hana', () => {
    it('maps SAP purchase order fields to canonical format', async () => {
      const { parsed, isError } = await client.callTool('connectors.map', {
        source: 'sap-s4hana',
        rows: [{
          Supplier: 'SAP Vendor GmbH', NetPriceAmount: 25000, DocumentCurrency: 'eur',
          OrderQuantity: 500, PurchaseOrderQuantityUnit: 'EA', MaterialGroup: 'Electronics',
          PurchaseOrderDate: '2025-09-01T10:00:00Z', CompanyCode: '1000',
        }],
      });
      assert.strictEqual(isError, false);
      const row = parsed.mapped_rows[0];
      assert.strictEqual(row.vendor, 'SAP Vendor GmbH');
      assert.strictEqual(row.amount, 25000);
      assert.strictEqual(row.currency, 'EUR');
      assert.strictEqual(row.quantity, 500);
      assert.strictEqual(row.unit, 'EA');
      assert.strictEqual(row.org_unit, '1000');
    });
  });

  // ── Error handling ──
  describe('error handling', () => {
    it('returns RPC error for unknown tool name', async () => {
      const resp = await client.send('tools/call', { name: 'connectors.nonexistent', arguments: {} });
      assert.ok(resp.error);
    });

    it('returns RPC -32601 for unknown method', async () => {
      const resp = await client.send('nonexistent/method', {});
      assert.ok(resp.error);
      assert.strictEqual(resp.error.code, -32601);
    });
  });
});
