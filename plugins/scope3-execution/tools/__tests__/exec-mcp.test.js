'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// ── MCP test client ──────────────────────────────────────────────────────────

function createMcpClient(serverPath) {
  const child = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
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
      } catch (_e) { /* ignore */ }
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
        reject(new Error(`Timeout: ${method} (id=${id})`));
      }, 10000);

      pending.set(id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });

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

  async function initialize() {
    return send('initialize', { protocolVersion: '2024-11-05' });
  }

  function close() {
    child.stdin.end();
    child.kill('SIGTERM');
  }

  return { send, callTool, initialize, close };
}

// ── Test suite ──────────────────────────────────────────────────────────────

const SERVER_PATH = path.resolve(__dirname, '..', 'exec-mcp.js');
let client;

describe('exec-mcp.js', () => {
  before(async () => {
    client = createMcpClient(SERVER_PATH);
    await client.initialize();
  });

  after(() => {
    if (client) client.close();
    // Clean up test collections
    const dataDir = path.resolve(__dirname, '..', '..', 'data');
    for (const f of fs.readdirSync(dataDir)) {
      if (f.startsWith('_test_')) {
        try { fs.unlinkSync(path.join(dataDir, f)); } catch (_e) { /* ignore */ }
      }
    }
  });

  // ── Health ──

  describe('exec.health', () => {
    it('returns server info', async () => {
      const { parsed } = await client.callTool('exec.health');
      assert.ok(parsed.plugin);
      assert.ok(parsed.server);
      assert.ok(parsed.timestamp);
    });
  });

  // ── Pipeline ──

  describe('pipeline', () => {
    it('exec.pipeline.run completes all 5 stages', async () => {
      const { parsed, isError } = await client.callTool('exec.pipeline.run', { period: 'test-2025' });
      assert.strictEqual(isError, false);
      assert.ok(parsed.run_id);
      assert.strictEqual(parsed.stages.length, 5);
      assert.ok(parsed.stages.every(s => s.status === 'completed'));
      assert.strictEqual(parsed.status, 'DONE');
    });

    it('exec.pipeline.stage runs a single stage', async () => {
      const { parsed } = await client.callTool('exec.pipeline.stage', { stage: 'seed' });
      assert.strictEqual(parsed.stage, 'seed');
      assert.strictEqual(parsed.status, 'completed');
    });

    it('exec.pipeline.stage rejects invalid stage', async () => {
      const { isError } = await client.callTool('exec.pipeline.stage', { stage: 'nonexistent' });
      assert.strictEqual(isError, true);
    });
  });

  // ── Upload PDF + Render + OCR flow ──

  describe('document flow (upload -> render -> ocr)', () => {
    let docId;

    it('exec.upload_pdf registers a document', async () => {
      const { parsed, isError } = await client.callTool('exec.upload_pdf', {
        filename: 'test-report.pdf',
        title: 'Test Sustainability Report',
        company_id: 'SUPPLIER-001',
        category: 'sustainability_report',
      });
      assert.strictEqual(isError, false);
      assert.ok(parsed.doc_id);
      docId = parsed.doc_id;
    });

    it('exec.render_page returns render record (may not have real image)', async () => {
      if (!docId) return;
      const { parsed } = await client.callTool('exec.render_page', {
        doc_id: docId,
        page_number: 1,
        zoom: 1.0,
      });
      assert.ok(parsed.render);
      assert.strictEqual(parsed.render.doc_id, docId);
      assert.strictEqual(parsed.render.page_number, 1);
    });

    it('exec.ocr returns blocks (simulated or real)', async () => {
      if (!docId) return;
      const { parsed } = await client.callTool('exec.ocr', {
        doc_id: docId,
        page_number: 1,
      });
      assert.ok(parsed.block_count > 0);
      assert.ok(Array.isArray(parsed.blocks));
      for (const block of parsed.blocks) {
        assert.ok(block.block_id);
        assert.ok(typeof block.confidence === 'number');
        assert.ok(block.confidence >= 0 && block.confidence <= 1);
      }
    });

    it('exec.render_page rejects nonexistent doc', async () => {
      const { isError } = await client.callTool('exec.render_page', {
        doc_id: 'nonexistent-doc',
        page_number: 1,
      });
      assert.strictEqual(isError, true);
    });
  });

  // ── Maturity Scoring ──

  describe('maturity scoring', () => {
    const supplierId = `sup-maturity-${Date.now()}`;

    it('M0: no evidence = unverified', async () => {
      // Create supplier first
      await client.callTool('exec.db.set', {
        collection: 'suppliers',
        doc: { _id: supplierId, name: 'Test Supplier', evidence_status: 'missing_public_report' },
      });

      const { parsed } = await client.callTool('exec.maturity_score', { supplier_id: supplierId });
      assert.strictEqual(parsed.level, 'M0_unverified');
      assert.strictEqual(parsed.score, 0);
    });

    it('M2: evidence ok, no engagement', async () => {
      // Add 3 provenance records and set evidence ok
      for (let i = 0; i < 3; i++) {
        await client.callTool('exec.db.set', {
          collection: 'provenance',
          doc: { entity_type: 'supplier', entity_id: supplierId, field_key: `field${i}` },
        });
      }
      await client.callTool('exec.db.set', {
        collection: 'suppliers',
        doc: { _id: supplierId, name: 'Test Supplier', evidence_status: 'ok' },
      });

      const { parsed } = await client.callTool('exec.maturity_score', { supplier_id: supplierId });
      assert.strictEqual(parsed.level, 'M2_evidence_ready');
      assert.strictEqual(parsed.score, 50);
    });

    it('M4: completed engagement', async () => {
      await client.callTool('exec.engagement.update', {
        supplier_id: supplierId,
        status: 'completed',
      });

      const { parsed } = await client.callTool('exec.maturity_score', { supplier_id: supplierId });
      assert.strictEqual(parsed.level, 'M4_commitment_recorded');
      assert.strictEqual(parsed.score, 100);
    });

    it('rejects nonexistent supplier', async () => {
      const { isError } = await client.callTool('exec.maturity_score', { supplier_id: 'nonexistent' });
      assert.strictEqual(isError, true);
    });
  });

  // ── Quality Gates ──

  describe('quality gates', () => {
    it('reports gate results for a run', async () => {
      const { parsed } = await client.callTool('exec.quality_gates', { run_id: 'test-run' });
      assert.ok(parsed.gates);
      assert.ok(Array.isArray(parsed.gates));
      assert.ok(parsed.gates.length >= 5);
      for (const gate of parsed.gates) {
        assert.ok(gate.gate);
        assert.ok(typeof gate.pass === 'boolean');
      }
    });
  });

  // ── Provenance ──

  describe('provenance chain', () => {
    let docId;
    let blockId;

    it('saves provenance with OCR block reference', async () => {
      // Upload a doc first
      const { parsed: uploadResult } = await client.callTool('exec.upload_pdf', {
        filename: 'prov-test.pdf',
      });
      docId = uploadResult.doc_id;

      // Run OCR to get blocks
      const { parsed: ocrResult } = await client.callTool('exec.ocr', {
        doc_id: docId,
        page_number: 1,
      });
      blockId = ocrResult.blocks[0].block_id;

      // Save provenance
      const { parsed, isError } = await client.callTool('exec.provenance.save', {
        entity_type: 'supplier',
        entity_id: 'SUP-100',
        field_key: 'scope1_emissions',
        doc_id: docId,
        page_number: 1,
        ocr_block_ids: [blockId],
        value: '12345',
        unit: 'tCO2e',
      });
      assert.strictEqual(isError, false);
      assert.ok(parsed.provenance);
      assert.ok(parsed.provenance.ocr_confidence_min != null);
    });

    it('lists provenance for an entity', async () => {
      const { parsed } = await client.callTool('exec.provenance.list', {
        entity_type: 'supplier',
        entity_id: 'SUP-100',
      });
      assert.ok(parsed.count >= 1);
    });

    it('rejects provenance with invalid OCR block', async () => {
      const { isError } = await client.callTool('exec.provenance.save', {
        entity_type: 'supplier',
        entity_id: 'SUP-100',
        field_key: 'test',
        doc_id: docId,
        page_number: 1,
        ocr_block_ids: ['nonexistent-block'],
      });
      assert.strictEqual(isError, true);
    });
  });

  // ── Rate Limiting ──

  describe('rate limiting', () => {
    it('allows requests within rate limit', async () => {
      // upload_pdf has a limit of 6/min; first few calls should succeed
      const { isError } = await client.callTool('exec.upload_pdf', { filename: 'rate-test.pdf' });
      assert.strictEqual(isError, false);
    });
  });

  // ── Export ──

  describe('export', () => {
    it('exports JSON format', async () => {
      const { parsed } = await client.callTool('exec.export', { format: 'json' });
      assert.strictEqual(parsed.format, 'json');
      assert.ok(parsed.record_counts);
    });

    it('exports CSRD format', async () => {
      const { parsed } = await client.callTool('exec.export', { format: 'csrd' });
      assert.strictEqual(parsed.framework, 'CSRD/ESRS');
      assert.ok(parsed.sections);
    });

    it('exports GHG format', async () => {
      const { parsed } = await client.callTool('exec.export', { format: 'ghg' });
      assert.strictEqual(parsed.framework, 'GHG Protocol');
      assert.ok(parsed.scopes);
    });

    it('exports PDF manifest format', async () => {
      const { parsed } = await client.callTool('exec.export', { format: 'pdf' });
      assert.ok(Array.isArray(parsed.pages));
    });

    it('rejects invalid format', async () => {
      const { isError } = await client.callTool('exec.export', { format: 'xlsx' });
      assert.strictEqual(isError, true);
    });
  });

  // ── Engagements ──

  describe('engagements', () => {
    it('creates and lists engagements', async () => {
      await client.callTool('exec.engagement.update', {
        supplier_id: 'ENGAGE-SUP',
        status: 'in_progress',
      });
      const { parsed } = await client.callTool('exec.engagement.list', {});
      assert.ok(parsed.count >= 1);
      assert.ok(parsed.engagements.some(e => e.supplier_id === 'ENGAGE-SUP'));
    });

    it('rejects invalid engagement status', async () => {
      const { isError } = await client.callTool('exec.engagement.update', {
        supplier_id: 'ENGAGE-SUP',
        status: 'invalid_status',
      });
      assert.strictEqual(isError, true);
    });
  });

  // ── Suppliers ──

  describe('suppliers', () => {
    before(async () => {
      await client.callTool('exec.db.set', {
        collection: 'suppliers',
        doc: { _id: 'sup-a', name: 'Alpha', category: 'logistics', cee_rating: 'B', upstream_impact_pct: 15 },
      });
      await client.callTool('exec.db.set', {
        collection: 'suppliers',
        doc: { _id: 'sup-b', name: 'Beta', category: 'manufacturing', cee_rating: 'D', upstream_impact_pct: 5 },
      });
    });

    it('lists all suppliers', async () => {
      const { parsed } = await client.callTool('exec.suppliers.list', {});
      assert.ok(parsed.count >= 2);
    });

    it('filters by category', async () => {
      const { parsed } = await client.callTool('exec.suppliers.list', { category: 'logistics' });
      assert.ok(parsed.suppliers.every(s => s.category === 'logistics'));
    });

    it('filters by min_impact', async () => {
      const { parsed } = await client.callTool('exec.suppliers.list', { min_impact: 10 });
      assert.ok(parsed.suppliers.every(s => s.upstream_impact_pct >= 10));
    });

    it('generates heatmap', async () => {
      const { parsed } = await client.callTool('exec.suppliers.heatmap', {});
      assert.ok(typeof parsed.total_suppliers === 'number');
      assert.ok(parsed.heatmap);
    });
  });
});
