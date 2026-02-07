#!/usr/bin/env node
'use strict';

// MCP stdio server (LSP-style message framing + JSON-RPC 2.0).
// Implements: initialize, tools/list, tools/call.
// Bridges ERP/CRM/expense/card data sources to CarbonKit canonical format.
// No external deps. Uses Node built-ins only.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Plugin manifest ───────────────────────────────────────────────────────────

const MANIFEST_PATH = path.resolve(__dirname, '..', '.claude-plugin', 'plugin.json');

function readPluginManifest() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed?.name === 'string' ? parsed.name : 'connectors',
      version: typeof parsed?.version === 'string' ? parsed.version : '0.0.0',
    };
  } catch (_err) {
    return { name: 'connectors', version: '0.0.0' };
  }
}

const PLUGIN = readPluginManifest();
const SERVER_NAME = `${PLUGIN.name}-mcp`;
const SERVER_VERSION = PLUGIN.version;

// ─── Store (unified adapter) ────────────────────────────────────────────────
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const { createStore } = require('../../shared-services/tools/store-adapter');
const store = createStore({ dataDir: DATA_DIR, serverName: SERVER_NAME });

// ─── YAML parser (minimal, handles our mapping configs) ────────────────────────

function parseSimpleYaml(text) {
  const result = {};
  let currentKey = null;
  let currentObj = null;
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const topMatch = line.match(/^([a-z_]+):\s*(.*)$/);
    if (topMatch) {
      const key = topMatch[1];
      const val = topMatch[2].trim();
      if (val === '' || val === '|') {
        currentKey = key;
        currentObj = {};
        result[key] = currentObj;
      } else {
        result[key] = val.replace(/^["']|["']$/g, '');
        currentKey = null;
        currentObj = null;
      }
      continue;
    }

    const nestedMatch = line.match(/^\s+([a-z_]+):\s*(.*)$/);
    if (nestedMatch && currentObj) {
      const nk = nestedMatch[1];
      let nv = nestedMatch[2].trim().replace(/^["']|["']$/g, '');
      if (nv === 'null' || nv === '~') nv = null;
      currentObj[nk] = nv;
    }
  }
  return result;
}

// ─── Mapping config loader ─────────────────────────────────────────────────────

const MAPPINGS_DIR = path.resolve(__dirname, '..', 'mappings');

function loadMappingConfig(source) {
  const safe = String(source).replace(/[^a-zA-Z0-9_-]/g, '_');
  const candidates = [
    path.join(MAPPINGS_DIR, `${safe}.yaml`),
    path.join(MAPPINGS_DIR, `${safe}.yml`),
  ];
  for (const fp of candidates) {
    if (fs.existsSync(fp)) {
      const raw = fs.readFileSync(fp, 'utf8');
      return parseSimpleYaml(raw);
    }
  }
  return null;
}

function listMappingConfigs() {
  if (!fs.existsSync(MAPPINGS_DIR)) return [];
  const files = fs.readdirSync(MAPPINGS_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(MAPPINGS_DIR, f), 'utf8');
    const config = parseSimpleYaml(raw);
    return {
      file: f,
      source: config.source || f.replace(/\.ya?ml$/, ''),
      version: config.version || '1.0',
      api_type: config.api_type || 'unknown',
      auth_type: config.auth_type || 'none',
    };
  });
}

// ─── Lookup tables ──────────────────────────────────────────────────────────────

function loadLookupTable(name) {
  const fp = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (_e) {
    return null;
  }
}

// ─── Transform functions ───────────────────────────────────────────────────────

function applyTransform(value, transformName) {
  if (value == null) return null;

  switch (transformName) {
    case 'iso8601': {
      const d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toISOString().split('T')[0];
    }
    case 'iso4217_validate': {
      const code = String(value).toUpperCase().trim();
      if (/^[A-Z]{3}$/.test(code)) return code;
      return null;
    }
    case 'to_number': {
      const n = Number(value);
      return isNaN(n) ? null : n;
    }
    case 'to_string': {
      return String(value);
    }
    case 'uppercase': {
      return String(value).toUpperCase();
    }
    case 'trim': {
      return String(value).trim();
    }
    default:
      return value;
  }
}

function resolveField(row, fieldPath) {
  if (fieldPath == null || fieldPath === 'null') return null;
  const parts = String(fieldPath).split('.');
  let current = row;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    current = current[part];
  }
  return current;
}

function categoryLookup(rawCategory, lookupTableName) {
  if (!rawCategory || !lookupTableName) return rawCategory;
  const table = loadLookupTable(lookupTableName);
  if (!table) return rawCategory;

  const key = String(rawCategory).trim();
  if (table[key]) {
    const entry = table[key];
    return typeof entry === 'object' ? entry.unspsc || entry.code || key : String(entry);
  }
  return key;
}

// ─── Core mapping engine ───────────────────────────────────────────────────────

const CANONICAL_FIELDS = ['vendor', 'amount', 'currency', 'quantity', 'unit', 'category', 'date', 'org_unit'];

function mapRow(sourceRow, config) {
  const mapping = config.canonical_mapping || {};
  const transforms = config.transforms || {};
  const result = {};
  const warnings = [];

  for (const field of CANONICAL_FIELDS) {
    const sourceField = mapping[field];
    let value = resolveField(sourceRow, sourceField);

    // Apply field-specific transforms
    if (transforms[field]) {
      value = applyTransform(value, transforms[field]);
    }

    // Apply category lookup if configured
    if (field === 'category' && transforms.category_lookup) {
      value = categoryLookup(value, transforms.category_lookup);
    }

    // Type coercion for numeric fields
    if ((field === 'amount' || field === 'quantity') && value != null) {
      const num = Number(value);
      if (!isNaN(num)) {
        value = num;
      } else {
        warnings.push(`${field}: could not convert "${value}" to number`);
        value = null;
      }
    }

    result[field] = value != null ? value : null;
  }

  return { row: result, warnings };
}

function mapBatch(sourceRows, config) {
  const results = [];
  const allWarnings = [];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < sourceRows.length; i++) {
    try {
      const { row, warnings } = mapRow(sourceRows[i], config);
      results.push(row);
      if (warnings.length > 0) {
        allWarnings.push({ row_index: i, warnings });
      }
      successCount++;
    } catch (err) {
      errorCount++;
      allWarnings.push({ row_index: i, warnings: [`mapping error: ${err.message}`] });
      results.push(null);
    }
  }

  return {
    mapped_rows: results.filter(Boolean),
    total_rows: sourceRows.length,
    success_count: successCount,
    error_count: errorCount,
    warnings: allWarnings,
  };
}

// ─── Validation engine ─────────────────────────────────────────────────────────

function validateRow(sourceRow, config) {
  const mapping = config.canonical_mapping || {};
  const issues = [];

  for (const field of CANONICAL_FIELDS) {
    const sourceField = mapping[field];
    if (!sourceField || sourceField === 'null') continue;

    const value = resolveField(sourceRow, sourceField);
    if (value == null || value === '') {
      issues.push({ field, source_field: sourceField, issue: 'missing_value' });
    }
  }

  // Required fields that must be non-null
  const required = ['vendor', 'amount', 'currency', 'date'];
  for (const field of required) {
    const sourceField = mapping[field];
    if (!sourceField || sourceField === 'null') {
      issues.push({ field, issue: 'no_mapping_defined' });
    }
  }

  return issues;
}

function validateBatch(sourceRows, config) {
  const rowIssues = [];
  let cleanCount = 0;

  for (let i = 0; i < sourceRows.length; i++) {
    const issues = validateRow(sourceRows[i], config);
    if (issues.length > 0) {
      rowIssues.push({ row_index: i, issues });
    } else {
      cleanCount++;
    }
  }

  const fieldSummary = {};
  for (const ri of rowIssues) {
    for (const issue of ri.issues) {
      const key = `${issue.field}:${issue.issue}`;
      fieldSummary[key] = (fieldSummary[key] || 0) + 1;
    }
  }

  return {
    total_rows: sourceRows.length,
    clean_rows: cleanCount,
    rows_with_issues: rowIssues.length,
    field_summary: fieldSummary,
    details: rowIssues.slice(0, 50),
  };
}

// ─── Canonical to activity_rows conversion ──────────────────────────────────────

function canonicalToActivityRow(canonical) {
  return {
    vendor: canonical.vendor,
    item_description: canonical.category || null,
    spend_original: canonical.amount,
    currency_original: canonical.currency,
    quantity: canonical.quantity,
    unit: canonical.unit,
    category: canonical.category,
    gl_code: null,
    date: canonical.date,
    org_unit: canonical.org_unit,
  };
}

// ─── Wire + MCP protocol ──────────────────────────────────────────────────────

function sendFrame(msg) {
  const json = JSON.stringify(msg);
  const byteLen = Buffer.byteLength(json, 'utf8');
  process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  const err = { jsonrpc: '2.0', id, error: { code, message } };
  if (data !== undefined) err.error.data = data;
  return err;
}

function ok(text) {
  return { content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text) }], isError: false };
}

function fail(text) {
  return { content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text) }], isError: true };
}

// ─── Tool definitions ──────────────────────────────────────────────────────────

function listTools() {
  return {
    tools: [
      {
        name: 'connectors.health',
        description: 'Returns plugin name/version, available mapping configs, and server timestamp.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        name: 'connectors.list',
        description: 'List available mapping configs and their status (source name, API type, auth type, version).',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        name: 'connectors.map',
        description: 'Transform an array of source data rows through a mapping config. Returns canonical format rows.',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Mapping config name (e.g. "sap-s4hana", "xero", "generic-csv").' },
            rows: { type: 'array', items: { type: 'object' }, description: 'Array of source data row objects.' },
          },
          required: ['source', 'rows'],
          additionalProperties: false,
        },
      },
      {
        name: 'connectors.ingest',
        description: 'Map source data through a config and convert to calc-mcp activity_rows format ready for calc.ingest.',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Mapping config name.' },
            rows: { type: 'array', items: { type: 'object' }, description: 'Source data rows.' },
            filename: { type: 'string', description: 'Original source filename for audit trail.' },
          },
          required: ['source', 'rows'],
          additionalProperties: false,
        },
      },
      {
        name: 'connectors.validate',
        description: 'Check source data against a mapping schema. Reports missing/invalid fields without transforming.',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Mapping config name.' },
            rows: { type: 'array', items: { type: 'object' }, description: 'Source data rows to validate.' },
          },
          required: ['source', 'rows'],
          additionalProperties: false,
        },
      },
      {
        name: 'connectors.preview',
        description: 'Show what mapped data would look like without persisting. Returns first N mapped rows.',
        inputSchema: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'Mapping config name.' },
            rows: { type: 'array', items: { type: 'object' }, description: 'Source data rows.' },
            limit: { type: 'number', description: 'Max preview rows to return. Default 5.' },
          },
          required: ['source', 'rows'],
          additionalProperties: false,
        },
      },
      {
        name: 'connectors.db.get',
        description: 'Query documents from a connector state collection.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string', description: 'Collection name (e.g. connector_state, mapping_overrides, ingestion_log).' },
            query: { type: 'object', description: 'Key-value filter object.' },
            limit: { type: 'number', description: 'Max documents to return.' },
          },
          required: ['collection'],
          additionalProperties: false,
        },
      },
      {
        name: 'connectors.db.set',
        description: 'Upsert a document into a connector state collection.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string', description: 'Collection name.' },
            doc: { type: 'object', description: 'Document to upsert.' },
          },
          required: ['collection', 'doc'],
          additionalProperties: false,
        },
      },
      {
        name: 'connectors.db.delete',
        description: 'Delete documents matching query from a connector state collection.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string', description: 'Collection name.' },
            query: { type: 'object', description: 'Key-value filter. Must be non-empty.' },
          },
          required: ['collection', 'query'],
          additionalProperties: false,
        },
      },
      {
        name: 'connectors.db.list',
        description: 'List documents from a connector state collection.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string', description: 'Collection name.' },
            query: { type: 'object', description: 'Optional filter.' },
            limit: { type: 'number', description: 'Max documents.' },
          },
          required: ['collection'],
          additionalProperties: false,
        },
      },
    ],
  };
}

// ─── Tool dispatch ─────────────────────────────────────────────────────────────

function callTool(name, args) {
  switch (name) {
    case 'connectors.health': {
      const configs = listMappingConfigs();
      return ok({
        plugin: { name: PLUGIN.name, version: PLUGIN.version },
        server: { name: SERVER_NAME, version: SERVER_VERSION },
        timestamp: new Date().toISOString(),
        data_dir: DATA_DIR,
        mappings_dir: MAPPINGS_DIR,
        available_configs: configs.length,
        configs: configs.map((c) => c.source),
      });
    }

    case 'connectors.list': {
      const configs = listMappingConfigs();
      return ok({ count: configs.length, configs });
    }

    case 'connectors.map': {
      if (!args || typeof args.source !== 'string') return fail('Missing source');
      if (!Array.isArray(args.rows)) return fail('Missing rows array');
      const config = loadMappingConfig(args.source);
      if (!config) return fail(`No mapping config found for source: ${args.source}`);
      const result = mapBatch(args.rows, config);
      return ok(result);
    }

    case 'connectors.ingest': {
      if (!args || typeof args.source !== 'string') return fail('Missing source');
      if (!Array.isArray(args.rows)) return fail('Missing rows array');
      const config = loadMappingConfig(args.source);
      if (!config) return fail(`No mapping config found for source: ${args.source}`);

      const mapResult = mapBatch(args.rows, config);
      const activityRows = mapResult.mapped_rows.map(canonicalToActivityRow);

      // Log the ingestion
      const logEntry = store.set('ingestion_log', {
        source: args.source,
        filename: args.filename || 'unknown',
        total_rows: mapResult.total_rows,
        success_count: mapResult.success_count,
        error_count: mapResult.error_count,
        timestamp: new Date().toISOString(),
      });

      return ok({
        source: args.source,
        mapping_result: {
          total_rows: mapResult.total_rows,
          success_count: mapResult.success_count,
          error_count: mapResult.error_count,
          warnings: mapResult.warnings,
        },
        activity_rows: activityRows,
        activity_row_count: activityRows.length,
        log_id: logEntry._id,
        note: 'Pass activity_rows to calc.ingest to create a calculation job.',
      });
    }

    case 'connectors.validate': {
      if (!args || typeof args.source !== 'string') return fail('Missing source');
      if (!Array.isArray(args.rows)) return fail('Missing rows array');
      const config = loadMappingConfig(args.source);
      if (!config) return fail(`No mapping config found for source: ${args.source}`);
      const result = validateBatch(args.rows, config);
      return ok({ source: args.source, ...result });
    }

    case 'connectors.preview': {
      if (!args || typeof args.source !== 'string') return fail('Missing source');
      if (!Array.isArray(args.rows)) return fail('Missing rows array');
      const config = loadMappingConfig(args.source);
      if (!config) return fail(`No mapping config found for source: ${args.source}`);

      const limit = typeof args.limit === 'number' ? args.limit : 5;
      const preview = args.rows.slice(0, limit);
      const mapResult = mapBatch(preview, config);

      return ok({
        source: args.source,
        preview_count: mapResult.mapped_rows.length,
        canonical_rows: mapResult.mapped_rows,
        activity_rows: mapResult.mapped_rows.map(canonicalToActivityRow),
        warnings: mapResult.warnings,
        mapping_config: {
          source: config.source,
          version: config.version,
          api_type: config.api_type,
          fields: config.canonical_mapping,
        },
      });
    }

    case 'connectors.db.get': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      const docs = store.list(args.collection, args.query || {}, args.limit);
      return ok({ collection: args.collection, count: docs.length, docs });
    }

    case 'connectors.db.set': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      if (!args.doc || typeof args.doc !== 'object') return fail('Missing doc object');
      const doc = store.set(args.collection, args.doc);
      return ok({ collection: args.collection, doc });
    }

    case 'connectors.db.delete': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      if (!args.query || typeof args.query !== 'object') return fail('Missing query object');
      try {
        const result = store.delete(args.collection, args.query);
        return ok({ collection: args.collection, ...result });
      } catch (e) {
        return fail(e.message);
      }
    }

    case 'connectors.db.list': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      const docs = store.list(args.collection, args.query || {}, args.limit);
      return ok({ collection: args.collection, count: docs.length, docs });
    }

    default:
      return { jsonrpc: '2.0', id: null, error: { code: -32601, message: `Unknown tool: ${name}` } };
  }
}

// ─── JSON-RPC message handler ──────────────────────────────────────────────────

async function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    const id = msg && Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
    return jsonRpcError(id, -32600, 'Invalid Request');
  }
  if (!Object.prototype.hasOwnProperty.call(msg, 'id')) return null;
  const id = msg.id;

  try {
    switch (msg.method) {
      case 'initialize': {
        const requested =
          msg.params && typeof msg.params.protocolVersion === 'string'
            ? msg.params.protocolVersion
            : '2024-11-05';
        return jsonRpcResult(id, {
          protocolVersion: requested,
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          capabilities: { tools: { listChanged: false } },
          instructions:
            'Connectors MCP server. Bridges ERP/CRM/expense/card data sources to CarbonKit canonical format via schema mapping configs. Tools: health, list, map, ingest, validate, preview, and DB CRUD.',
        });
      }
      case 'tools/list': {
        return jsonRpcResult(id, { ...listTools(), nextCursor: null });
      }
      case 'tools/call': {
        const toolName = msg.params && msg.params.name;
        const toolArgs = msg.params && (msg.params.arguments || msg.params.args);
        if (typeof toolName !== 'string') {
          return jsonRpcError(id, -32602, 'Invalid params: missing tool name');
        }
        const result = await callTool(toolName, toolArgs);
        if (result && result.jsonrpc === '2.0' && result.error) {
          return jsonRpcError(id, result.error.code, result.error.message, result.error.data);
        }
        return jsonRpcResult(id, result);
      }
      default: {
        return jsonRpcError(id, -32601, `Method not found: ${msg.method}`);
      }
    }
  } catch (e) {
    return jsonRpcError(id, -32603, 'Internal error', {
      message: e && e.message ? e.message : String(e),
    });
  }
}

// ─── LSP framing (stdin) ───────────────────────────────────────────────────────

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

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (_e) {
      sendFrame(jsonRpcError(null, -32700, 'Parse error'));
      continue;
    }
    enqueueMessage(parsed);
  }
}

// ─── Transport selection (stdio vs HTTP) ──────────────────────────────────────

const transport = (process.env.CARBONKIT_MCP_TRANSPORT || 'stdio').toLowerCase();

if (transport === 'http') {
  const { startHttpTransport } = require('../../shared-services/tools/mcp-http-transport');
  const port = process.env.CARBONKIT_MCP_PORT || process.env.CARBONKIT_CONNECTORS_PORT || 8406;
  startHttpTransport(handleMessage, null, port, { serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
} else {
  // Serialize request handling to avoid interleaved stdout frames.
  let _queue = Promise.resolve();
  enqueueMessage = function enqueueMessage(msg) {
    _queue = _queue.then(async () => {
      const resp = await handleMessage(msg);
      if (resp) sendFrame(resp);
    }).catch((err) => {
      const id = msg && Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
      sendFrame(jsonRpcError(id, -32603, err?.message || 'Internal error'));
    });
  };

  // stdio mode (default)
  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    tryParseMessages();
  });

  process.stdin.on('error', (err) => {
    process.stderr.write(`[connectors-mcp] stdin error: ${err?.stack || String(err)}\n`);
  });

  process.stdin.resume();
}

module.exports = { handleMessage };
