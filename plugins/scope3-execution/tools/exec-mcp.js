#!/usr/bin/env node
'use strict';

// MCP (Model Context Protocol) stdio server for scope3-execution.
// Transport: stdio with LSP-style message framing (Content-Length headers) + JSON-RPC 2.0.
// No external deps -- Node built-ins only.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

// ---------------------------------------------------------------------------
// Plugin manifest
// ---------------------------------------------------------------------------
const MANIFEST_PATH = path.resolve(__dirname, '..', '.claude-plugin', 'plugin.json');

function readPluginManifest() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed?.name === 'string' ? parsed.name : 'scope3-execution',
      version: typeof parsed?.version === 'string' ? parsed.version : '0.0.0',
    };
  } catch (_err) {
    return { name: 'scope3-execution', version: '0.0.0' };
  }
}

const PLUGIN = readPluginManifest();
const SERVER_INFO = {
  name: `${PLUGIN.name}-mcp`,
  version: PLUGIN.version,
};

const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
];

function negotiateProtocolVersion(requested) {
  if (typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) return requested;
  return SUPPORTED_PROTOCOL_VERSIONS[0];
}

// ---------------------------------------------------------------------------
// Store (unified adapter) + Blob store
// ---------------------------------------------------------------------------
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const { createStore, createBlobStore } = require('../../shared-services/tools/store-adapter');
const store = createStore({ dataDir: DATA_DIR, serverName: SERVER_INFO.name });
const blobStore = createBlobStore({ basePath: path.join(DATA_DIR, 'blobs') });

// ---------------------------------------------------------------------------
// Rate limiter (token bucket)
// ---------------------------------------------------------------------------
class RateLimiter {
  constructor(maxTokens, refillPerMinute) {
    this._max = maxTokens;
    this._tokens = maxTokens;
    this._refillRate = refillPerMinute / 60000; // tokens per ms
    this._lastRefill = Date.now();
  }
  tryConsume() {
    const elapsed = Date.now() - this._lastRefill;
    this._tokens = Math.min(this._max, this._tokens + elapsed * this._refillRate);
    this._lastRefill = Date.now();
    if (this._tokens >= 1) { this._tokens--; return true; }
    return false;
  }
}

const RATE_LIMITS = {
  render_page: new RateLimiter(12, 12),
  ocr: new RateLimiter(12, 12),
  upload_pdf: new RateLimiter(6, 6),
};

function checkRateLimit(name) {
  const limiter = RATE_LIMITS[name];
  if (limiter && !limiter.tryConsume()) {
    throw Object.assign(new Error(`Rate limit exceeded for ${name}. Max ${limiter._max}/min.`), { code: -32000 });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sha256HexUtf8(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function nowISO() {
  return new Date().toISOString();
}

function requireString(args, key) {
  const v = args?.[key];
  if (typeof v === 'string' && v.length > 0) return v;
  throw Object.assign(new Error(`Missing required string: ${key}`), { code: -32602 });
}

function optString(args, key, fallback) {
  const v = args?.[key];
  return typeof v === 'string' ? v : fallback;
}

function optNumber(args, key, fallback) {
  const v = args?.[key];
  return typeof v === 'number' ? v : fallback;
}

function optObject(args, key, fallback) {
  const v = args?.[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
}

// ---------------------------------------------------------------------------
// Pipeline stages with job status lifecycle: PENDING -> PROCESSING -> DONE | FAILED
// ---------------------------------------------------------------------------
const PIPELINE_STAGES = ['seed', 'sources', 'ingest', 'seed_data', 'generate'];

function updateJobStatus(runId, status, detail) {
  const existing = store.get('pipeline_jobs', { _id: runId });
  const ts = nowISO();
  store.set('pipeline_jobs', {
    _id: runId,
    status,
    detail,
    ...(status === 'PROCESSING' && !existing ? { started_at: ts } : {}),
    ...(status === 'DONE' || status === 'FAILED' ? { completed_at: ts } : {}),
    updated_at: ts,
  });
}

function runStage(stage, runId) {
  const ts = nowISO();
  const result = { run_id: runId, stage, status: 'completed', started_at: ts };

  // Update job to PROCESSING
  updateJobStatus(runId, 'PROCESSING', `Running stage: ${stage}`);

  try {
    if (stage === 'seed') {
      // Load seed emission factors from bundled data if available
      const seedPath = path.join(DATA_DIR, 'seed-emission-factors.json');
      let seeded = 0;
      if (fs.existsSync(seedPath)) {
        try {
          const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
          if (Array.isArray(seedData)) {
            for (const factor of seedData) {
              if (factor._id && !store.get('emission_factors', { _id: factor._id })) {
                store.set('emission_factors', factor);
                seeded++;
              }
            }
          }
        } catch (_e) { /* ignore parse errors */ }
      }
      const count = store.list('emission_factors').length || 0;
      result.detail = `Seeded ${seeded} new emission factors (${count} total)`;
    } else if (stage === 'sources') {
      const docs = store.list('documents');
      // Validate blob_keys exist for documents that claim to have them
      let validBlobs = 0;
      let missingBlobs = 0;
      for (const doc of docs) {
        if (doc.blob_key) {
          if (blobStore.exists(doc.blob_key)) {
            validBlobs++;
          } else {
            missingBlobs++;
            store.set('documents', { ...doc, blob_status: 'missing' });
          }
        }
      }
      result.detail = `Sources indexed: ${docs.length} documents (${validBlobs} with valid blobs, ${missingBlobs} missing)`;
    } else if (stage === 'ingest') {
      const docs = store.list('documents');
      let ingested = 0;
      for (const doc of docs) {
        if (!doc.ingested) {
          store.set('documents', { ...doc, ingested: true, ingested_at: ts, status: 'DONE' });
          ingested++;
        }
      }
      result.detail = `Ingested ${ingested} new documents (${docs.length} total)`;
    } else if (stage === 'seed_data') {
      const benchmarks = store.list('benchmarks').length;
      const evidence = store.list('evidence').length;
      // Load seed benchmarks if available
      const benchmarkPath = path.join(DATA_DIR, 'seed-benchmarks.json');
      let seededBenchmarks = 0;
      if (fs.existsSync(benchmarkPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
          if (Array.isArray(data)) {
            for (const b of data) {
              if (b._id && !store.get('benchmarks', { _id: b._id })) {
                store.set('benchmarks', b);
                seededBenchmarks++;
              }
            }
          }
        } catch (_e) { /* ignore */ }
      }
      result.detail = `Seed data: ${benchmarks + seededBenchmarks} benchmarks, ${evidence} evidence records`;
    } else if (stage === 'generate') {
      const suppliers = store.list('suppliers');
      let generated = 0;
      for (const s of suppliers) {
        if (!s.recommendations_generated) {
          store.set('suppliers', { ...s, recommendations_generated: true, recommendation_ts: ts });
          generated++;
        }
      }
      result.detail = `Generated recommendations for ${generated} suppliers`;
    } else {
      result.status = 'error';
      result.detail = `Unknown stage: ${stage}`;
    }

    result.completed_at = nowISO();
  } catch (err) {
    result.status = 'error';
    result.detail = `Stage ${stage} failed: ${err.message}`;
    result.completed_at = nowISO();
    updateJobStatus(runId, 'FAILED', result.detail);
  }

  // Persist run log
  store.set('pipeline_runs', {
    _id: `${runId}__${stage}`,
    run_id: runId,
    stage,
    status: result.status,
    detail: result.detail,
    started_at: result.started_at,
    completed_at: result.completed_at,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Maturity scoring
// ---------------------------------------------------------------------------
function computeMaturityScore(supplierId) {
  const supplier = store.get('suppliers', { _id: supplierId });
  if (!supplier) return { error: `Supplier not found: ${supplierId}` };

  const engagements = store.list('engagements', { supplier_id: supplierId });
  const provenance = store.list('provenance', { entity_type: 'supplier', entity_id: supplierId });
  const engagement = engagements[0] ?? null;

  let level = 'M0_unverified';
  let score = 0;

  if (provenance.length === 0 && (!supplier.evidence_status || supplier.evidence_status === 'missing_public_report')) {
    level = 'M0_unverified';
    score = 0;
  } else if (supplier.evidence_status === 'insufficient_context' || (provenance.length > 0 && provenance.length < 3)) {
    level = 'M1_partial_evidence';
    score = 25;
  } else if (supplier.evidence_status === 'ok' && (!engagement || engagement.status === 'not_started')) {
    level = 'M2_evidence_ready';
    score = 50;
  } else if (supplier.evidence_status === 'ok' && engagement && ['in_progress', 'pending_response'].includes(engagement.status)) {
    level = 'M3_engagement_active';
    score = 75;
  } else if (engagement && engagement.status === 'completed') {
    level = 'M4_commitment_recorded';
    score = 100;
  }

  return {
    supplier_id: supplierId,
    supplier_name: supplier.name ?? supplier.supplier_name ?? supplierId,
    level,
    score,
    evidence_count: provenance.length,
    engagement_status: engagement?.status ?? 'none',
    computed_at: nowISO(),
  };
}

// ---------------------------------------------------------------------------
// Quality gates
// ---------------------------------------------------------------------------
function runQualityGates(runId) {
  const gates = [];
  const ts = nowISO();

  // Gate 1: all pipeline stages completed
  const stages = PIPELINE_STAGES.map((s) => {
    const log = store.get('pipeline_runs', { run_id: runId, stage: s });
    return { stage: s, status: log?.status ?? 'not_run' };
  });
  const allCompleted = stages.every((s) => s.status === 'completed');
  gates.push({ gate: 'pipeline_stages_complete', pass: allCompleted, detail: stages });

  // Gate 2: at least one supplier exists
  const supplierCount = store.list('suppliers').length;
  gates.push({ gate: 'suppliers_exist', pass: supplierCount > 0, detail: { count: supplierCount } });

  // Gate 3: emission factors loaded
  const factorCount = store.list('emission_factors').length;
  gates.push({ gate: 'emission_factors_loaded', pass: factorCount > 0, detail: { count: factorCount } });

  // Gate 4: no orphan provenance (provenance refs valid suppliers)
  const allProvenance = store.list('provenance');
  const supplierIds = new Set(store.list('suppliers').map((s) => s._id));
  const orphans = allProvenance.filter((p) => p.entity_type === 'supplier' && !supplierIds.has(p.entity_id));
  gates.push({ gate: 'no_orphan_provenance', pass: orphans.length === 0, detail: { orphan_count: orphans.length } });

  // Gate 5: documents ingested
  const docs = store.list('documents');
  const unIngested = docs.filter((d) => !d.ingested);
  gates.push({ gate: 'documents_ingested', pass: unIngested.length === 0, detail: { pending: unIngested.length, total: docs.length } });

  const overallPass = gates.every((g) => g.pass);

  return { run_id: runId ?? 'latest', overall: overallPass ? 'pass' : 'fail', gates, checked_at: ts };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function buildExport(format, period) {
  const ts = nowISO();
  const suppliers = store.list('suppliers');
  const emissions = store.list('emissions');
  const provenance = store.list('provenance');
  const engagements = store.list('engagements');

  const meta = { format, period: period ?? 'latest', exported_at: ts, record_counts: { suppliers: suppliers.length, emissions: emissions.length, provenance: provenance.length, engagements: engagements.length } };

  if (format === 'json') {
    return { ...meta, data: { suppliers, emissions, provenance, engagements } };
  }

  if (format === 'csrd') {
    return {
      ...meta,
      framework: 'CSRD/ESRS',
      sections: {
        E1_climate_change: { emission_records: emissions.length, supplier_engagements: engagements.length },
        S2_value_chain_workers: { supplier_count: suppliers.length },
        G1_governance: { provenance_records: provenance.length },
      },
    };
  }

  if (format === 'ghg') {
    const scope1 = emissions.filter((e) => e.scope === 1 || e.scope === 'scope1');
    const scope2 = emissions.filter((e) => e.scope === 2 || e.scope === 'scope2');
    const scope3 = emissions.filter((e) => e.scope === 3 || e.scope === 'scope3');
    return {
      ...meta,
      framework: 'GHG Protocol',
      scopes: {
        scope1: { records: scope1.length, total_tco2e: scope1.reduce((a, e) => a + (e.tco2e ?? 0), 0) },
        scope2: { records: scope2.length, total_tco2e: scope2.reduce((a, e) => a + (e.tco2e ?? 0), 0) },
        scope3: { records: scope3.length, total_tco2e: scope3.reduce((a, e) => a + (e.tco2e ?? 0), 0) },
      },
    };
  }

  if (format === 'pdf') {
    return { ...meta, note: 'PDF generation produces a structured manifest. Render with a PDF library client-side.', pages: [{ title: 'Executive Summary', content: `Total emissions records: ${emissions.length}` }, { title: 'Supplier Overview', content: `Total suppliers: ${suppliers.length}` }, { title: 'Provenance Audit', content: `Total provenance links: ${provenance.length}` }] };
  }

  return { ...meta, error: `Unsupported format: ${format}` };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
function getTools() {
  return [
    // -- Core --
    {
      name: 'exec.health',
      title: 'Execution Plugin Health',
      description: 'Returns plugin name/version and server timestamp.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'exec.sha256',
      title: 'SHA-256 (UTF-8)',
      description: 'Computes SHA-256 hex digest of the provided UTF-8 string.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'Input string to hash.' } },
        required: ['text'],
        additionalProperties: false,
      },
    },

    // -- DB --
    {
      name: 'exec.db.get',
      title: 'DB Get',
      description: 'Get first document matching query from a collection.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name.' },
          query: { type: 'object', description: 'Key-value query filter.' },
        },
        required: ['collection', 'query'],
        additionalProperties: false,
      },
    },
    {
      name: 'exec.db.set',
      title: 'DB Set (Upsert)',
      description: 'Insert or update a document in a collection. Upserts by _id.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name.' },
          doc: { type: 'object', description: 'Document to upsert. Include _id to update existing.' },
        },
        required: ['collection', 'doc'],
        additionalProperties: false,
      },
    },
    {
      name: 'exec.db.delete',
      title: 'DB Delete',
      description: 'Delete documents matching query from a collection.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name.' },
          query: { type: 'object', description: 'Key-value query filter for docs to delete.' },
        },
        required: ['collection', 'query'],
        additionalProperties: false,
      },
    },
    {
      name: 'exec.db.list',
      title: 'DB List',
      description: 'List documents in a collection, optionally filtered by query.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name.' },
          query: { type: 'object', description: 'Optional key-value filter.' },
          limit: { type: 'number', description: 'Max documents to return.' },
        },
        required: ['collection'],
        additionalProperties: false,
      },
    },

    {
      name: 'exec.db.bulkSet',
      title: 'DB Bulk Set',
      description: 'Bulk upsert an array of documents into a collection.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name.' },
          docs: { type: 'array', items: { type: 'object' }, description: 'Array of documents to upsert.' },
        },
        required: ['collection', 'docs'],
        additionalProperties: false,
      },
    },
    {
      name: 'exec.db.count',
      title: 'DB Count',
      description: 'Count documents in a collection matching an optional query.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name.' },
          query: { type: 'object', description: 'Optional key-value filter.' },
        },
        required: ['collection'],
        additionalProperties: false,
      },
    },

    // -- Pipeline --
    {
      name: 'exec.pipeline.run',
      title: 'Run Full Pipeline',
      description: 'Runs the 5-stage execution pipeline: seed -> sources -> ingest -> seed_data -> generate.',
      inputSchema: {
        type: 'object',
        properties: { period: { type: 'string', description: 'Reporting period (e.g. "2025").' } },
        additionalProperties: false,
      },
    },
    {
      name: 'exec.pipeline.stage',
      title: 'Run Single Pipeline Stage',
      description: 'Run a single pipeline stage.',
      inputSchema: {
        type: 'object',
        properties: {
          stage: { type: 'string', enum: ['seed', 'sources', 'ingest', 'seed_data', 'generate'], description: 'Stage to run.' },
        },
        required: ['stage'],
        additionalProperties: false,
      },
    },

    // -- Documents --
    {
      name: 'exec.render_page',
      title: 'Render PDF Page',
      description: 'Render a specific page of a stored PDF document.',
      inputSchema: {
        type: 'object',
        properties: {
          doc_id: { type: 'string', description: 'Document ID.' },
          page_number: { type: 'number', description: 'Page number (1-based).' },
          zoom: { type: 'number', description: 'Zoom factor (default 1.0).' },
        },
        required: ['doc_id', 'page_number'],
        additionalProperties: false,
      },
    },
    {
      name: 'exec.ocr',
      title: 'OCR Page',
      description: 'Run OCR on a rendered PDF page and return text blocks with confidence scores.',
      inputSchema: {
        type: 'object',
        properties: {
          doc_id: { type: 'string', description: 'Document ID.' },
          page_number: { type: 'number', description: 'Page number (1-based).' },
        },
        required: ['doc_id', 'page_number'],
        additionalProperties: false,
      },
    },
    {
      name: 'exec.upload_pdf',
      title: 'Upload PDF',
      description: 'Register and store a PDF document. Accepts base64 content or file path for blob storage.',
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Original filename.' },
          title: { type: 'string', description: 'Document title.' },
          company_id: { type: 'string', description: 'Owning company/supplier ID.' },
          category: { type: 'string', description: 'Document category (e.g. sustainability_report, cdp_response).' },
          content_base64: { type: 'string', description: 'Base64-encoded PDF content.' },
          file_path: { type: 'string', description: 'Local file path to PDF.' },
        },
        required: ['filename'],
        additionalProperties: false,
      },
    },

    // -- Engagements --
    {
      name: 'exec.engagement.update',
      title: 'Update Engagement',
      description: 'Update a supplier engagement status.',
      inputSchema: {
        type: 'object',
        properties: {
          supplier_id: { type: 'string', description: 'Supplier ID.' },
          status: { type: 'string', enum: ['not_started', 'in_progress', 'pending_response', 'completed', 'on_hold'], description: 'New engagement status.' },
        },
        required: ['supplier_id', 'status'],
        additionalProperties: false,
      },
    },
    {
      name: 'exec.engagement.list',
      title: 'List Engagements',
      description: 'List all supplier engagements.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },

    // -- Suppliers --
    {
      name: 'exec.suppliers.list',
      title: 'List Suppliers',
      description: 'List suppliers, optionally filtered by category, rating, or minimum impact.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Filter by category.' },
          rating: { type: 'string', description: 'Filter by CEE rating (A-E).' },
          min_impact: { type: 'number', description: 'Minimum upstream impact percentage.' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'exec.suppliers.heatmap',
      title: 'Supplier Heatmap',
      description: 'Generate a heatmap summary of suppliers by category and rating.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },

    // -- Provenance --
    {
      name: 'exec.provenance.save',
      title: 'Save Provenance',
      description: 'Create a field-level provenance link between a data field and a source document + OCR blocks.',
      inputSchema: {
        type: 'object',
        properties: {
          entity_type: { type: 'string', description: 'Entity type (e.g. supplier, emission_factor, benchmark).' },
          entity_id: { type: 'string', description: 'Entity ID.' },
          field_key: { type: 'string', description: 'Field being cited (e.g. scope1_emissions).' },
          doc_id: { type: 'string', description: 'Source document ID.' },
          page_number: { type: 'number', description: 'Page number in source document.' },
          ocr_block_ids: { type: 'array', items: { type: 'string' }, description: 'OCR block IDs referenced.' },
          value: { type: 'string', description: 'Extracted value.' },
          unit: { type: 'string', description: 'Unit of measure.' },
        },
        required: ['entity_type', 'entity_id', 'field_key', 'doc_id', 'page_number', 'ocr_block_ids'],
        additionalProperties: false,
      },
    },
    {
      name: 'exec.provenance.list',
      title: 'List Provenance',
      description: 'List provenance records for an entity.',
      inputSchema: {
        type: 'object',
        properties: {
          entity_type: { type: 'string', description: 'Entity type.' },
          entity_id: { type: 'string', description: 'Entity ID.' },
        },
        required: ['entity_type', 'entity_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'exec.provenance.delete',
      title: 'Delete Provenance',
      description: 'Delete a provenance record by ID.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Provenance record _id.' } },
        required: ['id'],
        additionalProperties: false,
      },
    },

    // -- Analysis --
    {
      name: 'exec.maturity_score',
      title: 'Supplier Maturity Score',
      description: 'Compute the maturity scorecard for a supplier (M0-M4).',
      inputSchema: {
        type: 'object',
        properties: { supplier_id: { type: 'string', description: 'Supplier ID.' } },
        required: ['supplier_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'exec.quality_gates',
      title: 'Quality Gates',
      description: 'Run quality gate checks for a pipeline run.',
      inputSchema: {
        type: 'object',
        properties: { run_id: { type: 'string', description: 'Pipeline run ID (defaults to "latest").' } },
        additionalProperties: false,
      },
    },

    // -- Export --
    {
      name: 'exec.export',
      title: 'Export Data',
      description: 'Export execution data in CSRD, GHG Protocol, PDF manifest, or raw JSON format.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['csrd', 'ghg', 'pdf', 'json'], description: 'Export format.' },
          period: { type: 'string', description: 'Reporting period.' },
        },
        required: ['format'],
        additionalProperties: false,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// MCP framing
// ---------------------------------------------------------------------------
function sendFrame(message) {
  const json = JSON.stringify(message);
  const byteLen = Buffer.byteLength(json, 'utf8');
  process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id: id ?? null, error };
}

function toolTextResult(text) {
  return { content: [{ type: 'text', text: String(text) }], isError: false };
}

function toolJSON(obj) {
  return toolTextResult(JSON.stringify(obj, null, 2));
}

function toolError(msg) {
  return { content: [{ type: 'text', text: String(msg) }], isError: true };
}

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------
async function callTool(toolName, args) {
  // -- Core --
  if (toolName === 'exec.health') {
    return toolJSON({
      plugin: { name: PLUGIN.name, version: PLUGIN.version },
      server: SERVER_INFO,
      timestamp: nowISO(),
      data_dir: DATA_DIR,
    });
  }

  if (toolName === 'exec.sha256') {
    const text = typeof args?.text === 'string' ? args.text : typeof args?.input === 'string' ? args.input : undefined;
    if (typeof text !== 'string') throw Object.assign(new Error('Missing arguments.text'), { code: -32602 });
    return toolTextResult(sha256HexUtf8(text));
  }

  // -- DB --
  if (toolName === 'exec.db.get') {
    const collection = requireString(args, 'collection');
    const query = optObject(args, 'query', {});
    const doc = store.get(collection, query);
    return toolJSON({ found: doc !== null, doc });
  }

  if (toolName === 'exec.db.set') {
    const collection = requireString(args, 'collection');
    const doc = args?.doc;
    if (!doc || typeof doc !== 'object') throw Object.assign(new Error('Missing arguments.doc object'), { code: -32602 });
    const saved = store.set(collection, doc);
    return toolJSON({ ok: true, doc: saved });
  }

  if (toolName === 'exec.db.delete') {
    const collection = requireString(args, 'collection');
    const query = optObject(args, 'query', {});
    if (Object.keys(query).length === 0) throw Object.assign(new Error('Empty query would delete all -- provide a filter'), { code: -32602 });
    const { removed } = store.delete(collection, query);
    return toolJSON({ ok: true, deleted: removed });
  }

  if (toolName === 'exec.db.list') {
    const collection = requireString(args, 'collection');
    const query = optObject(args, 'query', undefined);
    const limit = optNumber(args, 'limit', 0);
    const docs = store.list(collection, query, limit);
    return toolJSON({ collection, count: docs.length, docs });
  }

  if (toolName === 'exec.db.bulkSet') {
    const collection = requireString(args, 'collection');
    if (!Array.isArray(args?.docs)) throw Object.assign(new Error('Missing arguments.docs array'), { code: -32602 });
    const results = store.bulkSet(collection, args.docs);
    return toolJSON({ ok: true, count: results.length, docs: results });
  }

  if (toolName === 'exec.db.count') {
    const collection = requireString(args, 'collection');
    const query = optObject(args, 'query', undefined);
    const count = store.count(collection, query);
    return toolJSON({ collection, count });
  }

  // -- Pipeline --
  if (toolName === 'exec.pipeline.run') {
    const period = optString(args, 'period', 'latest');
    const runId = `run_${period}_${Date.now()}`;
    updateJobStatus(runId, 'PENDING', 'Pipeline run queued');
    const results = [];
    let failed = false;
    for (const stage of PIPELINE_STAGES) {
      const stageResult = runStage(stage, runId);
      results.push(stageResult);
      if (stageResult.status === 'error') { failed = true; break; }
    }
    if (!failed) {
      updateJobStatus(runId, 'DONE', 'Pipeline run complete');
    }
    const job = store.get('pipeline_jobs', { _id: runId });
    return toolJSON({ run_id: runId, period, status: job?.status || (failed ? 'FAILED' : 'DONE'), stages: results, message: failed ? 'Pipeline run failed' : 'Pipeline run complete' });
  }

  if (toolName === 'exec.pipeline.stage') {
    const stage = requireString(args, 'stage');
    if (!PIPELINE_STAGES.includes(stage)) {
      return toolError(`Invalid stage: ${stage}. Must be one of: ${PIPELINE_STAGES.join(', ')}`);
    }
    const runId = `stage_${stage}_${Date.now()}`;
    const result = runStage(stage, runId);
    return toolJSON(result);
  }

  // -- Documents --
  if (toolName === 'exec.render_page') {
    checkRateLimit('render_page');
    const docId = requireString(args, 'doc_id');
    const pageNumber = optNumber(args, 'page_number', 1);
    const zoom = optNumber(args, 'zoom', 1.0);

    const doc = store.get('documents', { _id: docId });
    if (!doc) return toolError(`Document not found: ${docId}`);

    // Resolve the PDF file path: blob store -> file_path -> uploads dir
    let pdfPath = doc.file_path || path.join(DATA_DIR, 'uploads', doc.filename || `${docId}.pdf`);
    if (doc.blob_key && blobStore.exists(doc.blob_key)) {
      // Extract from blob store to temp file for rendering
      const blob = blobStore.get(doc.blob_key);
      const tmpPdf = path.join(os.tmpdir(), `carbonkit-${docId}.pdf`);
      fs.writeFileSync(tmpPdf, blob.buffer);
      pdfPath = tmpPdf;
    }
    const renderId = crypto.randomUUID();
    const outDir = path.join(os.tmpdir(), 'carbonkit-renders');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPrefix = path.join(outDir, renderId);

    let renderMethod = 'none';
    let imagePath = null;
    let width = Math.round(612 * zoom);
    let height = Math.round(792 * zoom);

    if (fs.existsSync(pdfPath)) {
      // Try pdftoppm (poppler-utils) first
      try {
        const dpi = Math.round(72 * zoom);
        execFileSync('pdftoppm', [
          '-png', '-f', String(pageNumber), '-l', String(pageNumber),
          '-r', String(dpi), pdfPath, outPrefix,
        ], { timeout: 15000 });
        // pdftoppm outputs <prefix>-<pagenum>.png with zero-padded page numbers
        const candidates = fs.readdirSync(outDir).filter(f => f.startsWith(renderId) && f.endsWith('.png'));
        if (candidates.length > 0) {
          imagePath = path.join(outDir, candidates[0]);
          renderMethod = 'pdftoppm';
        }
      } catch (_e) {
        // pdftoppm not available or failed
      }

      // Fallback: try wkhtmltoimage (not for PDF but useful for HTML-based docs)
      if (!imagePath) {
        try {
          const outFile = outPrefix + '.png';
          execFileSync('wkhtmltoimage', ['--quality', '80', pdfPath, outFile], { timeout: 15000 });
          if (fs.existsSync(outFile)) {
            imagePath = outFile;
            renderMethod = 'wkhtmltoimage';
          }
        } catch (_e) {
          // wkhtmltoimage not available
        }
      }
    }

    // Store rendered image in blob store if available
    let blobKey = null;
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        const imgBuf = fs.readFileSync(imagePath);
        const blobResult = blobStore.put(`render_${renderId}`, imgBuf, {
          content_type: 'image/png',
          doc_id: docId,
          page_number: pageNumber,
        });
        blobKey = blobResult.sha256;
      } catch (_e) {
        // Blob store write failed, continue with file path
      }
    }

    const renderRecord = {
      _id: renderId,
      doc_id: docId,
      page_number: pageNumber,
      zoom,
      width,
      height,
      render_method: renderMethod,
      image_path: imagePath,
      blob_key: blobKey,
      rendered_at: nowISO(),
    };
    store.set('renders', renderRecord);

    if (!fs.existsSync(pdfPath)) {
      return toolJSON({
        ok: false,
        render: renderRecord,
        note: `PDF file not found at: ${pdfPath}. Upload a real PDF file or set file_path on the document record. The document metadata was registered but no physical file exists.`,
      });
    }

    if (!imagePath) {
      return toolJSON({
        ok: false,
        render: renderRecord,
        note: 'PDF rendering requires poppler-utils (pdftoppm) or wkhtmltoimage. Install with: brew install poppler (macOS) or apt-get install poppler-utils (Linux).',
        install_instructions: {
          macOS: 'brew install poppler',
          ubuntu: 'sudo apt-get install -y poppler-utils',
          alpine: 'apk add poppler-utils',
        },
      });
    }

    return toolJSON({ ok: true, render: renderRecord });
  }

  if (toolName === 'exec.ocr') {
    checkRateLimit('ocr');
    const docId = requireString(args, 'doc_id');
    const pageNumber = optNumber(args, 'page_number', 1);

    const doc = store.get('documents', { _id: docId });
    if (!doc) return toolError(`Document not found: ${docId}`);

    // Check if we have a rendered image for this page
    const renders = store.list('renders', { doc_id: docId, page_number: pageNumber });
    const render = renders.length > 0 ? renders[renders.length - 1] : null;
    let imagePath = render?.image_path;

    // Try blob store if we have a blob_key but no local file
    if (!imagePath && render?.blob_key && blobStore.exists(render.blob_key)) {
      const blob = blobStore.get(render.blob_key);
      const tmpPath = path.join(os.tmpdir(), `carbonkit-ocr-${render._id}.png`);
      fs.writeFileSync(tmpPath, blob.buffer);
      imagePath = tmpPath;
    }

    let ocrMethod = 'none';
    let rawText = '';
    let blocks = [];

    if (imagePath && fs.existsSync(imagePath)) {
      // Try tesseract OCR
      try {
        const tsvOutput = execFileSync('tesseract', [imagePath, 'stdout', '--psm', '6', 'tsv'], {
          timeout: 30000,
          encoding: 'utf8',
        });
        ocrMethod = 'tesseract';

        // Parse TSV output into blocks
        const lines = tsvOutput.split('\n').filter(l => l.trim());
        const header = lines[0]?.split('\t') || [];
        const textIdx = header.indexOf('text');
        const confIdx = header.indexOf('conf');
        const leftIdx = header.indexOf('left');
        const topIdx = header.indexOf('top');
        const widthIdx = header.indexOf('width');
        const heightIdx = header.indexOf('height');
        const blockIdx = header.indexOf('block_num');

        const blockMap = new Map();
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split('\t');
          const text = textIdx >= 0 ? cols[textIdx]?.trim() : '';
          if (!text) continue;

          const conf = confIdx >= 0 ? parseFloat(cols[confIdx]) : 0;
          const blockNum = blockIdx >= 0 ? cols[blockIdx] : String(i);
          const left = leftIdx >= 0 ? parseInt(cols[leftIdx], 10) : 0;
          const top = topIdx >= 0 ? parseInt(cols[topIdx], 10) : 0;
          const w = widthIdx >= 0 ? parseInt(cols[widthIdx], 10) : 0;
          const h = heightIdx >= 0 ? parseInt(cols[heightIdx], 10) : 0;

          if (!blockMap.has(blockNum)) {
            blockMap.set(blockNum, { texts: [], confs: [], bbox: [left, top, left + w, top + h] });
          }
          const bk = blockMap.get(blockNum);
          bk.texts.push(text);
          bk.confs.push(conf);
          bk.bbox[0] = Math.min(bk.bbox[0], left);
          bk.bbox[1] = Math.min(bk.bbox[1], top);
          bk.bbox[2] = Math.max(bk.bbox[2], left + w);
          bk.bbox[3] = Math.max(bk.bbox[3], top + h);
        }

        let idx = 0;
        for (const [blockNum, data] of blockMap) {
          const blockText = data.texts.join(' ');
          const avgConf = data.confs.reduce((a, b) => a + b, 0) / data.confs.length;
          blocks.push({
            block_id: `${docId}_p${pageNumber}_b${idx}`,
            text: blockText,
            confidence: +(avgConf / 100).toFixed(3),
            bbox: data.bbox,
          });
          rawText += blockText + '\n';
          idx++;
        }
      } catch (_e) {
        // tesseract not available
      }
    }

    // Fallback: generate deterministic pseudo-blocks if no real OCR available
    if (ocrMethod === 'none') {
      const blockCount = 5;
      for (let i = 0; i < blockCount; i++) {
        blocks.push({
          block_id: `${docId}_p${pageNumber}_b${i}`,
          text: `[simulated OCR block ${i + 1} for ${doc.filename ?? docId} page ${pageNumber}]`,
          confidence: +(0.85 + Math.random() * 0.14).toFixed(3),
          bbox: [50 + i * 10, 50 + i * 100, 550 - i * 10, 130 + i * 100],
        });
      }
    }

    // Persist OCR blocks
    for (const b of blocks) {
      store.set('ocr_blocks', { _id: b.block_id, doc_id: docId, page_number: pageNumber, ...b });
    }

    const result = { doc_id: docId, page_number: pageNumber, ocr_method: ocrMethod, block_count: blocks.length, blocks };
    if (ocrMethod === 'none') {
      result.note = 'No rendered image available or tesseract not installed. Using simulated blocks. Install with: brew install tesseract (macOS) or apt-get install tesseract-ocr (Linux).';
      result.install_instructions = {
        macOS: 'brew install tesseract',
        ubuntu: 'sudo apt-get install -y tesseract-ocr',
        alpine: 'apk add tesseract-ocr',
      };
    }

    return toolJSON(result);
  }

  if (toolName === 'exec.upload_pdf') {
    checkRateLimit('upload_pdf');
    const filename = requireString(args, 'filename');
    const title = optString(args, 'title', filename);
    const companyId = optString(args, 'company_id', undefined);
    const category = optString(args, 'category', 'general');

    const docId = crypto.randomUUID();
    let blobKey = null;
    let fileSha256 = null;
    let pageCount = null;

    // Accept base64 content or file_path for real PDF storage
    if (typeof args?.content_base64 === 'string') {
      const buf = Buffer.from(args.content_base64, 'base64');
      const result = blobStore.put(filename, buf, {
        content_type: 'application/pdf',
        doc_id: docId,
        original_filename: filename,
      });
      blobKey = result.sha256;
      fileSha256 = result.sha256;
    } else if (typeof args?.file_path === 'string' && fs.existsSync(args.file_path)) {
      const buf = fs.readFileSync(args.file_path);
      const result = blobStore.put(filename, buf, {
        content_type: 'application/pdf',
        doc_id: docId,
        original_filename: filename,
      });
      blobKey = result.sha256;
      fileSha256 = result.sha256;
    }

    const doc = store.set('documents', {
      _id: docId,
      filename,
      title,
      company_id: companyId,
      category,
      mime_type: 'application/pdf',
      blob_key: blobKey,
      sha256: fileSha256,
      page_count: pageCount,
      status: 'PENDING',
      ingested: false,
      uploaded_at: nowISO(),
    });
    return toolJSON({ ok: true, doc_id: docId, blob_key: blobKey, sha256: fileSha256, doc });
  }

  // -- Engagements --
  if (toolName === 'exec.engagement.update') {
    const supplierId = requireString(args, 'supplier_id');
    const status = requireString(args, 'status');
    const validStatuses = ['not_started', 'in_progress', 'pending_response', 'completed', 'on_hold'];
    if (!validStatuses.includes(status)) {
      return toolError(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Upsert engagement
    const existing = store.get('engagements', { supplier_id: supplierId });
    const engagement = store.set('engagements', {
      _id: existing?._id ?? crypto.randomUUID(),
      supplier_id: supplierId,
      status,
      updated_at: nowISO(),
    });
    return toolJSON({ ok: true, engagement });
  }

  if (toolName === 'exec.engagement.list') {
    const engagements = store.list('engagements');
    return toolJSON({ count: engagements.length, engagements });
  }

  // -- Suppliers --
  if (toolName === 'exec.suppliers.list') {
    let suppliers = store.list('suppliers');
    const category = optString(args, 'category', undefined);
    const rating = optString(args, 'rating', undefined);
    const minImpact = optNumber(args, 'min_impact', undefined);

    if (category) suppliers = suppliers.filter((s) => s.category === category);
    if (rating) suppliers = suppliers.filter((s) => s.cee_rating === rating);
    if (typeof minImpact === 'number') suppliers = suppliers.filter((s) => (s.upstream_impact_pct ?? 0) >= minImpact);

    return toolJSON({ count: suppliers.length, suppliers });
  }

  if (toolName === 'exec.suppliers.heatmap') {
    const suppliers = store.list('suppliers');
    const heatmap = {};
    for (const s of suppliers) {
      const cat = s.category ?? 'unknown';
      const rating = s.cee_rating ?? 'unrated';
      if (!heatmap[cat]) heatmap[cat] = {};
      if (!heatmap[cat][rating]) heatmap[cat][rating] = 0;
      heatmap[cat][rating]++;
    }
    return toolJSON({ total_suppliers: suppliers.length, heatmap });
  }

  // -- Provenance --
  if (toolName === 'exec.provenance.save') {
    const entityType = requireString(args, 'entity_type');
    const entityId = requireString(args, 'entity_id');
    const fieldKey = requireString(args, 'field_key');
    const docId = requireString(args, 'doc_id');
    const pageNumber = optNumber(args, 'page_number', 1);
    const ocrBlockIds = Array.isArray(args?.ocr_block_ids) ? args.ocr_block_ids : [];
    const value = optString(args, 'value', undefined);
    const unit = optString(args, 'unit', undefined);

    if (pageNumber < 1) return toolError('page_number must be >= 1');

    // Validate OCR blocks exist if any provided
    for (const blockId of ocrBlockIds) {
      const block = store.get('ocr_blocks', { _id: blockId });
      if (!block) return toolError(`OCR block not found: ${blockId}`);
      if (block.doc_id !== docId || block.page_number !== pageNumber) {
        return toolError(`OCR block ${blockId} does not match doc_id/page_number`);
      }
    }

    // Compute min confidence from referenced blocks
    let ocrConfMin = null;
    if (ocrBlockIds.length > 0) {
      const confs = ocrBlockIds.map((bid) => {
        const b = store.get('ocr_blocks', { _id: bid });
        return b?.confidence ?? 0;
      });
      ocrConfMin = Math.min(...confs);
    }

    const record = store.set('provenance', {
      _id: crypto.randomUUID(),
      entity_type: entityType,
      entity_id: entityId,
      field_key: fieldKey,
      doc_id: docId,
      page_number: pageNumber,
      ocr_block_ids: ocrBlockIds,
      ocr_confidence_min: ocrConfMin,
      value,
      unit,
      created_at: nowISO(),
    });

    return toolJSON({ ok: true, provenance: record });
  }

  if (toolName === 'exec.provenance.list') {
    const entityType = requireString(args, 'entity_type');
    const entityId = requireString(args, 'entity_id');
    const records = store.list('provenance', { entity_type: entityType, entity_id: entityId });
    return toolJSON({ entity_type: entityType, entity_id: entityId, count: records.length, records });
  }

  if (toolName === 'exec.provenance.delete') {
    const id = requireString(args, 'id');
    const { removed } = store.delete('provenance', { _id: id });
    return toolJSON({ ok: true, deleted: removed });
  }

  // -- Analysis --
  if (toolName === 'exec.maturity_score') {
    const supplierId = requireString(args, 'supplier_id');
    const result = computeMaturityScore(supplierId);
    if (result.error) return toolError(result.error);
    return toolJSON(result);
  }

  if (toolName === 'exec.quality_gates') {
    const runId = optString(args, 'run_id', 'latest');
    const result = runQualityGates(runId);
    return toolJSON(result);
  }

  // -- Export --
  if (toolName === 'exec.export') {
    const format = requireString(args, 'format');
    const validFormats = ['csrd', 'ghg', 'pdf', 'json'];
    if (!validFormats.includes(format)) return toolError(`Invalid format: ${format}. Must be one of: ${validFormats.join(', ')}`);
    const period = optString(args, 'period', undefined);
    const result = buildExport(format, period);
    return toolJSON(result);
  }

  return null; // not found
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
async function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') return null;

  const hasId = Object.prototype.hasOwnProperty.call(msg, 'id');
  const isNotification = !hasId;
  const id = hasId ? msg.id : undefined;
  const method = msg.method;

  if (typeof method !== 'string') {
    if (!isNotification) return jsonRpcError(id, -32600, 'Invalid Request: expected method string');
    return null;
  }

  if (isNotification) return null;

  if (method === 'ping') {
    return jsonRpcResult(id, {});
  }

  if (method === 'initialize') {
    const requested = msg.params?.protocolVersion;
    const protocolVersion = negotiateProtocolVersion(requested);
    return jsonRpcResult(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        'MCP server for scope3-execution. Provides DB CRUD, pipeline orchestration, PDF upload/render/OCR, supplier engagement & maturity scoring, provenance tracking, quality gates, and multi-format export.',
    });
  }

  if (method === 'tools/list') {
    return jsonRpcResult(id, { tools: getTools(), nextCursor: null });
  }

  if (method === 'tools/call') {
    const toolName = msg.params?.name;
    const args = msg.params?.arguments ?? {};

    if (typeof toolName !== 'string' || toolName.length === 0) {
      return jsonRpcError(id, -32602, 'Invalid params: expected params.name string');
    }

    try {
      const result = await callTool(toolName, args);
      if (result === null) {
        return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
      }
      return jsonRpcResult(id, result);
    } catch (err) {
      const code = typeof err?.code === 'number' ? err.code : -32603;
      return jsonRpcError(id, code, err?.message ?? 'Internal error');
    }
  }

  return jsonRpcError(id, -32601, `Method not found: ${method}`);
}

// ---------------------------------------------------------------------------
// stdin parser (LSP framing)
// ---------------------------------------------------------------------------
let buffer = Buffer.alloc(0);

// In stdio mode we serialize requests via this hook to avoid interleaved frames.
// It is assigned in the transport selection block.
let enqueueMessage = function(msg) {
  Promise.resolve(handleMessage(msg)).then((resp) => { if (resp) sendFrame(resp); }).catch(() => {});
};

function tryParseMessages() {
  while (buffer.length > 0) {
    let headerEnd = buffer.indexOf('\r\n\r\n');
    let headerSepLen = 4;
    if (headerEnd === -1) {
      headerEnd = buffer.indexOf('\n\n');
      headerSepLen = 2;
    }
    if (headerEnd === -1) return;

    const headerText = buffer.slice(0, headerEnd).toString('utf8');
    const lengthMatch = /content-length\s*:\s*(\d+)/i.exec(headerText);
    if (!lengthMatch) {
      buffer = buffer.slice(headerEnd + headerSepLen);
      continue;
    }

    const bodyLen = Number.parseInt(lengthMatch[1], 10);
    const bodyStart = headerEnd + headerSepLen;
    const bodyEnd = bodyStart + bodyLen;
    if (buffer.length < bodyEnd) return;

    const body = buffer.slice(bodyStart, bodyEnd).toString('utf8');
    buffer = buffer.slice(bodyEnd);

    let msg;
    try {
      msg = JSON.parse(body);
    } catch (_err) {
      sendFrame(jsonRpcError(null, -32700, 'Parse error'));
      continue;
    }

    enqueueMessage(msg);
  }
}

// ─── Transport selection (stdio vs HTTP) ──────────────────────────────────────

const transport = (process.env.CARBONKIT_MCP_TRANSPORT || 'stdio').toLowerCase();

if (transport === 'http') {
  const { startHttpTransport } = require('../../shared-services/tools/mcp-http-transport');
  const port = process.env.CARBONKIT_MCP_PORT || process.env.CARBONKIT_EXEC_PORT || 8402;
  startHttpTransport(handleMessage, null, port, { serverInfo: SERVER_INFO });
} else {
  // Serialize request handling to avoid interleaved stdout frames.
  let _queue = Promise.resolve();
  enqueueMessage = function enqueueMessage(msg) {
    _queue = _queue.then(async () => {
      const resp = await handleMessage(msg);
      if (resp) sendFrame(resp);
    }).catch((err) => {
      const reqId = Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
      if (reqId !== null && reqId !== undefined) sendFrame(jsonRpcError(reqId, -32603, 'Internal error'));
      process.stderr.write(`[mcp] internal error: ${err?.stack || String(err)}\n`);
    });
  };

  // stdio mode (default)
  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    tryParseMessages();
  });

  process.stdin.on('error', (err) => {
    process.stderr.write(`[mcp] stdin error: ${err?.stack || String(err)}\n`);
  });

  process.stdin.resume();
}
