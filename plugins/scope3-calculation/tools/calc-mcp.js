#!/usr/bin/env node
'use strict';

// MCP stdio server (LSP-style message framing + JSON-RPC 2.0).
// Implements: initialize, tools/list, tools/call.
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
      name: typeof parsed?.name === 'string' ? parsed.name : 'scope3-calculation',
      version: typeof parsed?.version === 'string' ? parsed.version : '0.0.0',
    };
  } catch (_err) {
    return { name: 'scope3-calculation', version: '0.0.0' };
  }
}

const PLUGIN = readPluginManifest();
const SERVER_NAME = `${PLUGIN.name}-mcp`;
const SERVER_VERSION = PLUGIN.version;

// ─── Store (unified adapter) ────────────────────────────────────────────────
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const { createStore } = require('../../shared-services/tools/store-adapter');
const store = createStore({ dataDir: DATA_DIR, serverName: SERVER_NAME });

// ─── FX rates (static, extendable via db) ──────────────────────────────────────

const DEFAULT_FX_RATES = {
  'USD/USD': 1,
  'EUR/USD': 1.08,
  'GBP/USD': 1.27,
  'JPY/USD': 0.0067,
  'CAD/USD': 0.74,
  'AUD/USD': 0.65,
  'CHF/USD': 1.13,
  'CNY/USD': 0.14,
  'INR/USD': 0.012,
  'BRL/USD': 0.20,
  'KRW/USD': 0.00075,
  'SEK/USD': 0.096,
  'NOK/USD': 0.094,
  'DKK/USD': 0.145,
  'SGD/USD': 0.75,
  'HKD/USD': 0.13,
  'MXN/USD': 0.058,
  'ZAR/USD': 0.055,
  'NZD/USD': 0.61,
};

function getFxRate(from, to) {
  from = String(from).toUpperCase();
  to = String(to).toUpperCase();
  if (from === to) return 1;

  // Check custom rates in db first
  const custom = store.list('fx_rates', { pair: `${from}/${to}` }, 1);
  if (custom.length > 0 && typeof custom[0].rate === 'number') return custom[0].rate;

  const fromToUsd = DEFAULT_FX_RATES[`${from}/USD`];
  const toToUsd = DEFAULT_FX_RATES[`${to}/USD`];
  if (fromToUsd !== undefined && toToUsd !== undefined) {
    return fromToUsd / toToUsd;
  }
  return null;
}

// ─── DQS scoring ───────────────────────────────────────────────────────────────

const DQS_PENALTIES = {
  vendor_missing_rate: 0.25,
  description_missing_rate: 0.25,
  spend_missing_rate: 0.30,
  currency_missing_rate: 0.10,
  quantity_missing_rate: 0.05,
  unit_missing_rate: 0.05,
};

const METHOD_QUALITY_SCORES = {
  supplier_primary: 1.0,
  average_quantity: 0.8,
  spend: 0.6,
  none: 0.3,
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function computeBaseScore(rows) {
  const total = rows.length || 1;
  const counts = {
    vendor_missing: 0,
    description_missing: 0,
    spend_missing: 0,
    currency_missing: 0,
    quantity_missing: 0,
    unit_missing: 0,
  };
  const currencies = new Set();

  for (const r of rows) {
    if (!r.vendor) counts.vendor_missing++;
    if (!r.item_description) counts.description_missing++;
    if (r.spend_original == null) counts.spend_missing++;
    if (!r.currency_original) counts.currency_missing++;
    else currencies.add(r.currency_original);
    if (r.quantity == null) counts.quantity_missing++;
    if (!r.unit) counts.unit_missing++;
  }

  let score = 1.0;
  score -= DQS_PENALTIES.vendor_missing_rate * (counts.vendor_missing / total);
  score -= DQS_PENALTIES.description_missing_rate * (counts.description_missing / total);
  score -= DQS_PENALTIES.spend_missing_rate * (counts.spend_missing / total);
  score -= DQS_PENALTIES.currency_missing_rate * (counts.currency_missing / total);
  score -= DQS_PENALTIES.quantity_missing_rate * (counts.quantity_missing / total);
  score -= DQS_PENALTIES.unit_missing_rate * (counts.unit_missing / total);
  if (currencies.size > 1) score -= 0.10;

  return {
    base_score: clamp(score, 0, 1),
    missing_rates: {
      vendor: counts.vendor_missing / total,
      description: counts.description_missing / total,
      spend: counts.spend_missing / total,
      currency: counts.currency_missing / total,
      quantity: counts.quantity_missing / total,
      unit: counts.unit_missing / total,
    },
    currency_count: currencies.size,
  };
}

function computeMethodScore(inventoryItems) {
  if (!inventoryItems || inventoryItems.length === 0) return 0.3;
  let totalWeight = 0;
  let weightedScore = 0;
  for (const item of inventoryItems) {
    const method = item.method || 'none';
    const score = METHOD_QUALITY_SCORES[method] || 0.3;
    const weight = Math.abs(item.emissions_total_kgco2e || 0) || 1;
    weightedScore += score * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedScore / totalWeight : 0.3;
}

function computeFinalDqs(baseScore, methodScore) {
  return clamp(0.7 * baseScore + 0.3 * methodScore, 0, 1);
}

// ─── Compute engine (method hierarchy) ─────────────────────────────────────────

function resolveMethod(group, factors) {
  // 1. supplier_primary
  if (group.primary_data && group.primary_data.emissions_total_kgco2e != null) {
    return {
      method: 'supplier_primary',
      emissions_kgco2e: group.primary_data.emissions_total_kgco2e,
      reason: 'primary_data.emissions_total_kgco2e present',
    };
  }
  if (
    group.primary_data &&
    group.primary_data.kgco2e_per_unit != null &&
    group.quantity_total != null
  ) {
    const em = group.quantity_total * group.primary_data.kgco2e_per_unit;
    return {
      method: 'supplier_primary',
      emissions_kgco2e: em,
      reason: 'quantity_total * primary_data.kgco2e_per_unit',
    };
  }

  // Find matching factors with multi-level hierarchy:
  // exact (vendor+category+unit+geography) -> category -> category_broad -> basis-only fallback
  function matchFactors(basis) {
    const basisFactors = (factors || []).filter((f) => f.basis === basis);
    if (basisFactors.length === 0) return null;

    // Level 1: exact match (vendor + category + unit + geography)
    const exact = basisFactors.filter((f) =>
      f.vendor && group.vendor && f.vendor.toLowerCase() === group.vendor.toLowerCase() &&
      f.category && group.category && f.category.toLowerCase() === group.category.toLowerCase() &&
      (!f.unit || !group.unit || f.unit.toLowerCase() === group.unit.toLowerCase())
    );
    if (exact.length > 0) return { factor: exact[0], match_level: 'exact' };

    // Level 2: category match
    const catMatch = basisFactors.filter((f) =>
      f.category && group.category && f.category.toLowerCase() === group.category.toLowerCase()
    );
    if (catMatch.length > 0) return { factor: catMatch[0], match_level: 'category' };

    // Level 3: broad category (first word match)
    if (group.category) {
      const broadCat = group.category.split(/[\s_/-]/)[0].toLowerCase();
      const broadMatch = basisFactors.filter((f) =>
        f.category && f.category.split(/[\s_/-]/)[0].toLowerCase() === broadCat
      );
      if (broadMatch.length > 0) return { factor: broadMatch[0], match_level: 'category_broad' };
    }

    // Level 4: fallback to first factor with matching basis
    return { factor: basisFactors[0], match_level: 'basis_only' };
  }

  // 2. average_quantity
  if (group.quantity_total != null) {
    const match = matchFactors('quantity');
    if (match) {
      const em = group.quantity_total * match.factor.kgco2e_per_unit;
      return {
        method: 'average_quantity',
        emissions_kgco2e: em,
        factor_id: match.factor._id || match.factor.factor_id,
        match_level: match.match_level,
        reason: `quantity_total (${group.quantity_total}) * factor (${match.factor.kgco2e_per_unit}) [${match.match_level}]`,
      };
    }
  }

  // 3. spend
  if (group.spend_reporting != null || group.spend_original != null) {
    const match = matchFactors('spend');
    if (match) {
      const spendUsed = group.spend_reporting != null ? group.spend_reporting : group.spend_original;
      const em = spendUsed * match.factor.kgco2e_per_unit;
      return {
        method: 'spend',
        emissions_kgco2e: em,
        factor_id: match.factor._id || match.factor.factor_id,
        match_level: match.match_level,
        spend_used: spendUsed,
        reason: `spend (${spendUsed}) * factor (${match.factor.kgco2e_per_unit}) [${match.match_level}]`,
      };
    }
  }

  // 4. none
  return {
    method: 'none',
    emissions_kgco2e: 0,
    reason: 'no usable method found',
  };
}

function runCompute(jobId, refresh, force) {
  const jobs = store.list('jobs', { _id: jobId });
  if (jobs.length === 0) return { error: true, code: 404, message: `Job not found: ${jobId}` };
  const job = jobs[0];

  if (job.status !== 'DONE') {
    return { error: true, code: 409, message: `Job status must be DONE, got: ${job.status}` };
  }
  if ((job.closed_at || job.closed_run_id) && !force) {
    return { error: true, code: 409, message: 'Period is closed. Use force=true to recompute.' };
  }

  // Check existing inventory
  const existingItems = store.list('inventory_items', { job_id: jobId });
  if (existingItems.length > 0 && !refresh) {
    const totalEmissions = existingItems.reduce(
      (s, i) => s + (i.emissions_total_kgco2e || 0),
      0
    );
    return {
      error: false,
      cached: true,
      run_id: job.latest_run_id,
      inventory_item_count: existingItems.length,
      total_emissions_kgco2e: totalEmissions,
      total_emissions_tco2e: totalEmissions / 1000,
    };
  }

  // Load activity rows and factors
  const rows = store.list('activity_rows', { job_id: jobId });
  const factors = store.list('emission_factors');
  const reportingCurrency = job.reporting_currency || 'USD';

  // Group rows by vendor + item_description
  const groups = {};
  for (const row of rows) {
    const key = `${row.vendor || ''}|${row.item_description || ''}`;
    if (!groups[key]) {
      groups[key] = {
        vendor: row.vendor,
        item_description: row.item_description,
        spend_original: 0,
        spend_reporting: 0,
        quantity_total: 0,
        currency_original: row.currency_original,
        unit: row.unit,
        primary_data: row.primary_data || null,
        row_count: 0,
        category: row.category || null,
      };
    }
    const g = groups[key];
    g.spend_original += row.spend_original || 0;
    g.quantity_total += row.quantity || 0;
    g.row_count += 1;

    // FX normalize spend
    if (row.currency_original && row.currency_original !== reportingCurrency) {
      const rate = getFxRate(row.currency_original, reportingCurrency);
      if (rate != null) {
        g.spend_reporting += (row.spend_original || 0) * rate;
      } else {
        g.spend_reporting += row.spend_original || 0;
      }
    } else {
      g.spend_reporting += row.spend_original || 0;
    }
  }

  // Compute per group
  const runId = store._generateId();
  const inventoryItems = [];
  const methodCounts = { supplier_primary: 0, average_quantity: 0, spend: 0, none: 0 };
  let totalSpend = 0;
  let totalSpendReporting = 0;
  let totalEmissions = 0;

  let groupIndex = 0;
  const groupEntries = Object.entries(groups);

  for (const [key, group] of groupEntries) {
    const result = resolveMethod(group, factors);
    const item = {
      _id: store._generateId(),
      job_id: jobId,
      run_id: runId,
      vendor: group.vendor,
      item_description: group.item_description,
      category: group.category,
      method: result.method,
      match_level: result.match_level || null,
      emissions_total_kgco2e: result.emissions_kgco2e,
      emissions_total_tco2e: result.emissions_kgco2e / 1000,
      spend_original: group.spend_original,
      spend_reporting: group.spend_reporting,
      quantity_total: group.quantity_total,
      unit: group.unit,
      factor_id: result.factor_id || null,
      reason: result.reason,
      row_count: group.row_count,
    };
    inventoryItems.push(item);
    methodCounts[result.method] = (methodCounts[result.method] || 0) + 1;
    totalSpend += group.spend_original;
    totalSpendReporting += group.spend_reporting;
    totalEmissions += result.emissions_kgco2e;
    groupIndex++;

    // Checkpoint every 100 groups to persist partial progress
    if (groupIndex % 100 === 0 && groupIndex < groupEntries.length) {
      store.set('compute_checkpoints', {
        _id: `${runId}_cp_${groupIndex}`,
        run_id: runId,
        job_id: jobId,
        groups_processed: groupIndex,
        groups_total: groupEntries.length,
        partial_emissions_kgco2e: totalEmissions,
        checkpoint_at: new Date().toISOString(),
      });
    }
  }

  // Persist inventory items (replace current view)
  store.delete('inventory_items', { job_id: jobId });

  // Use bulkSet for efficiency when many items
  if (inventoryItems.length > 0) {
    store.bulkSet('inventory_items', inventoryItems);
    // Write immutable version snapshots
    const versionDocs = inventoryItems.map((item) => ({
      ...item,
      _id: store._generateId(),
      event_type: 'compute',
      event_id: runId,
    }));
    store.bulkSet('inventory_item_versions', versionDocs);
  }

  // Write run record
  const runRecord = {
    _id: runId,
    job_id: jobId,
    inventory_item_count: inventoryItems.length,
    total_spend: totalSpend,
    total_spend_reporting: totalSpendReporting,
    reporting_currency_used: reportingCurrency,
    total_emissions_kgco2e: totalEmissions,
    total_emissions_tco2e: totalEmissions / 1000,
    methodology_counts: methodCounts,
    created_at: new Date().toISOString(),
  };
  store.set('lca_runs', runRecord);
  store.set('lca_run_history', { ...runRecord, _id: store._generateId() });

  // Update job with latest run pointer
  store.set('jobs', { _id: jobId, latest_run_id: runId });

  return {
    error: false,
    cached: false,
    run_id: runId,
    inventory_item_count: inventoryItems.length,
    total_spend: totalSpend,
    total_spend_reporting: totalSpendReporting,
    reporting_currency_used: reportingCurrency,
    total_emissions_kgco2e: totalEmissions,
    total_emissions_tco2e: totalEmissions / 1000,
    methodology_counts: methodCounts,
  };
}

// ─── Ingest engine ─────────────────────────────────────────────────────────────

function runIngest(filename, rows, reportingCurrency) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: true, code: 400, message: 'rows must be a non-empty array' };
  }

  const jobId = store._generateId();
  const now = new Date().toISOString();
  const flags = {
    MISSING_VENDOR: 0,
    MISSING_DESCRIPTION: 0,
    MISSING_SPEND: 0,
    MISSING_CURRENCY: 0,
    MISSING_QUANTITY: 0,
    MISSING_UNIT: 0,
  };
  const currencies = new Set();
  const units = new Set();
  let spendTotal = 0;
  let quantityTotal = 0;

  const activityRows = rows.map((r, idx) => {
    const rowFlags = [];
    if (!r.vendor) { flags.MISSING_VENDOR++; rowFlags.push('MISSING_VENDOR'); }
    if (!r.description && !r.item_description) { flags.MISSING_DESCRIPTION++; rowFlags.push('MISSING_DESCRIPTION'); }
    if (r.spend == null && r.spend_original == null) { flags.MISSING_SPEND++; rowFlags.push('MISSING_SPEND'); }
    if (!r.currency && !r.currency_original) { flags.MISSING_CURRENCY++; rowFlags.push('MISSING_CURRENCY'); }
    if (r.quantity == null) { flags.MISSING_QUANTITY++; rowFlags.push('MISSING_QUANTITY'); }
    if (!r.unit) { flags.MISSING_UNIT++; rowFlags.push('MISSING_UNIT'); }

    const currency = r.currency || r.currency_original || null;
    if (currency) currencies.add(currency);
    const unit = r.unit || null;
    if (unit) units.add(unit);

    const spend = r.spend != null ? r.spend : r.spend_original != null ? r.spend_original : 0;
    spendTotal += spend;
    quantityTotal += r.quantity || 0;

    return {
      _id: store._generateId(),
      job_id: jobId,
      row_index: idx,
      vendor: r.vendor || null,
      item_description: r.description || r.item_description || null,
      gl_code: r.gl_code || null,
      category: r.category || null,
      spend_original: spend,
      currency_original: currency,
      quantity: r.quantity != null ? r.quantity : null,
      unit: unit,
      primary_data: r.primary_data || null,
      data_quality_flags: rowFlags,
    };
  });

  // Persist activity rows
  for (const ar of activityRows) {
    store.set('activity_rows', ar);
  }

  const rowsWithFlags = activityRows.filter((r) => r.data_quality_flags.length > 0).length;
  const reconciliation = {
    missing: flags,
    missing_pct: {},
    currencies: [...currencies],
    units: [...units],
    distinct_counts: { vendors: new Set(rows.map((r) => r.vendor)).size, items: new Set(rows.map((r) => r.description || r.item_description)).size },
    flags,
    rows_with_any_flag: rowsWithFlags,
    rows_clean: rows.length - rowsWithFlags,
    spend_total: spendTotal,
    quantity_total: quantityTotal,
  };
  for (const key of Object.keys(flags)) {
    reconciliation.missing_pct[key] = rows.length > 0 ? flags[key] / rows.length : 0;
  }

  // Create job
  const job = {
    _id: jobId,
    filename: filename || 'unknown',
    status: 'DONE',
    row_count: rows.length,
    reporting_currency: reportingCurrency || 'USD',
    reconciliation,
    created_at: now,
    updated_at: now,
  };
  store.set('jobs', job);

  return {
    error: false,
    job_id: jobId,
    status: 'DONE',
    row_count: rows.length,
    reconciliation,
  };
}

// ─── Export engine ──────────────────────────────────────────────────────────────

function runExport(jobId, format) {
  const items = store.list('inventory_items', { job_id: jobId });
  if (items.length === 0) {
    return { error: true, code: 404, message: `No inventory items for job: ${jobId}` };
  }

  if (format === 'csv') {
    const headers = [
      'vendor',
      'item_description',
      'category',
      'method',
      'emissions_total_kgco2e',
      'emissions_total_tco2e',
      'spend_original',
      'spend_reporting',
      'quantity_total',
      'unit',
      'factor_id',
    ];
    // RFC 4180 compliant CSV escaping
    function csvEscape(val) {
      if (val == null) return '';
      const s = String(val);
      if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }
    const csvRows = [headers.map(csvEscape).join(',')];
    for (const item of items) {
      csvRows.push(headers.map((h) => csvEscape(item[h])).join(','));
    }
    return { error: false, format: 'csv', content: csvRows.join('\r\n'), item_count: items.length };
  }

  // JSON format
  return {
    error: false,
    format: 'json',
    content: JSON.stringify(items, null, 2),
    item_count: items.length,
  };
}

// ─── Wire + MCP protocol ──────────────────────────────────────────────────────

function write(msg) {
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
        name: 'calc.health',
        description: 'Returns plugin name/version and server timestamp.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: 'calc.sha256',
        description: 'Computes SHA-256 hex digest of the provided UTF-8 string.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Input text (UTF-8).' },
          },
          required: ['text'],
          additionalProperties: false,
        },
      },
      {
        name: 'calc.db.get',
        description: 'Query documents from a collection. Returns matching documents.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string', description: 'Collection name (e.g. jobs, activity_rows, inventory_items, emission_factors, fx_rates).' },
            query: { type: 'object', description: 'Key-value filter object. All fields must match (shallow equality).' },
            limit: { type: 'number', description: 'Max documents to return.' },
          },
          required: ['collection'],
          additionalProperties: false,
        },
      },
      {
        name: 'calc.db.set',
        description: 'Upsert a document into a collection. If doc has _id and it exists, merges. Otherwise inserts with generated _id.',
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
        name: 'calc.db.delete',
        description: 'Delete documents matching query from a collection.',
        inputSchema: {
          type: 'object',
          properties: {
            collection: { type: 'string', description: 'Collection name.' },
            query: { type: 'object', description: 'Key-value filter. Must be non-empty to prevent accidental wipe.' },
          },
          required: ['collection', 'query'],
          additionalProperties: false,
        },
      },
      {
        name: 'calc.db.list',
        description: 'List documents from a collection with optional filter and limit.',
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
        name: 'calc.db.bulkSet',
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
        name: 'calc.db.count',
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
      {
        name: 'calc.compute',
        description:
          'Run the emissions compute engine for a job. Applies method hierarchy: supplier_primary > average_quantity > spend > none. Produces inventory items, run record, and methodology counts.',
        inputSchema: {
          type: 'object',
          properties: {
            job_id: { type: 'string', description: 'Ingestion job ID.' },
            refresh: { type: 'boolean', description: 'Force recompute even if inventory exists. Default false.' },
            force: { type: 'boolean', description: 'Allow recompute on closed periods. Default false.' },
          },
          required: ['job_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'calc.fx_normalize',
        description: 'Convert an amount from one currency to another using built-in or custom FX rates.',
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Amount to convert.' },
            from_currency: { type: 'string', description: 'Source currency code (e.g. EUR).' },
            to_currency: { type: 'string', description: 'Target currency code (e.g. USD).' },
          },
          required: ['amount', 'from_currency', 'to_currency'],
          additionalProperties: false,
        },
      },
      {
        name: 'calc.dqs_score',
        description:
          'Compute the Data Quality Score for a job. Returns base score (from data completeness), method score (from methodology quality), and final DQS.',
        inputSchema: {
          type: 'object',
          properties: {
            job_id: { type: 'string', description: 'Job ID to score.' },
          },
          required: ['job_id'],
          additionalProperties: false,
        },
      },
      {
        name: 'calc.ingest',
        description:
          'Ingest activity data rows to create a calculation job. Validates data quality, produces reconciliation summary, and persists activity rows.',
        inputSchema: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Source filename for reference.' },
            rows: {
              type: 'array',
              description:
                'Array of row objects. Expected fields: vendor, description, spend, currency, quantity, unit, category, gl_code. Optional: primary_data { emissions_total_kgco2e, kgco2e_per_unit }.',
              items: { type: 'object' },
            },
            reporting_currency: { type: 'string', description: 'Target reporting currency. Default USD.' },
          },
          required: ['filename', 'rows'],
          additionalProperties: false,
        },
      },
      {
        name: 'calc.export',
        description: 'Export computed inventory items for a job as CSV or JSON.',
        inputSchema: {
          type: 'object',
          properties: {
            job_id: { type: 'string', description: 'Job ID to export.' },
            format: { type: 'string', enum: ['csv', 'json'], description: 'Output format. Default json.' },
          },
          required: ['job_id'],
          additionalProperties: false,
        },
      },
    ],
  };
}

// ─── Tool dispatch ─────────────────────────────────────────────────────────────

function callTool(name, args) {
  switch (name) {
    // ── Original tools ──
    case 'calc.health': {
      return ok({
        plugin: { name: PLUGIN.name, version: PLUGIN.version },
        server: { name: SERVER_NAME, version: SERVER_VERSION },
        timestamp: new Date().toISOString(),
        data_dir: DATA_DIR,
      });
    }
    case 'calc.sha256': {
      if (!args || typeof args.text !== 'string') {
        return fail('Invalid params: expected { text: string }');
      }
      const digest = crypto.createHash('sha256').update(args.text, 'utf8').digest('hex');
      return ok(digest);
    }

    // ── DB tools ──
    case 'calc.db.get': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      const docs = store.list(args.collection, args.query || {}, args.limit);
      return ok({ collection: args.collection, count: docs.length, docs });
    }
    case 'calc.db.set': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      if (!args.doc || typeof args.doc !== 'object') return fail('Missing doc object');
      const doc = store.set(args.collection, args.doc);
      return ok({ collection: args.collection, doc });
    }
    case 'calc.db.delete': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      if (!args.query || typeof args.query !== 'object') return fail('Missing query object');
      try {
        const result = store.delete(args.collection, args.query);
        return ok({ collection: args.collection, ...result });
      } catch (e) {
        return fail(e.message);
      }
    }
    case 'calc.db.list': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      const docs = store.list(args.collection, args.query || {}, args.limit);
      return ok({ collection: args.collection, count: docs.length, docs });
    }
    case 'calc.db.bulkSet': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      if (!Array.isArray(args.docs)) return fail('Missing docs array');
      const results = store.bulkSet(args.collection, args.docs);
      return ok({ collection: args.collection, count: results.length, docs: results });
    }
    case 'calc.db.count': {
      if (!args || typeof args.collection !== 'string') return fail('Missing collection');
      const count = store.count(args.collection, args.query || {});
      return ok({ collection: args.collection, count });
    }

    // ── Compute ──
    case 'calc.compute': {
      if (!args || typeof args.job_id !== 'string') return fail('Missing job_id');
      const result = runCompute(args.job_id, !!args.refresh, !!args.force);
      if (result.error) return fail(result);
      return ok(result);
    }

    // ── FX ──
    case 'calc.fx_normalize': {
      if (!args || typeof args.amount !== 'number') return fail('Missing amount');
      if (!args.from_currency || !args.to_currency) return fail('Missing from_currency or to_currency');
      const rate = getFxRate(args.from_currency, args.to_currency);
      if (rate == null) {
        return fail({ message: `No FX rate found for ${args.from_currency} -> ${args.to_currency}` });
      }
      const converted = args.amount * rate;
      return ok({
        original: args.amount,
        from_currency: args.from_currency.toUpperCase(),
        to_currency: args.to_currency.toUpperCase(),
        rate,
        converted,
      });
    }

    // ── DQS ──
    case 'calc.dqs_score': {
      if (!args || typeof args.job_id !== 'string') return fail('Missing job_id');
      const rows = store.list('activity_rows', { job_id: args.job_id });
      if (rows.length === 0) return fail({ message: `No activity rows for job: ${args.job_id}` });
      const { base_score, missing_rates, currency_count } = computeBaseScore(rows);
      const inventoryItems = store.list('inventory_items', { job_id: args.job_id });
      const method_score = computeMethodScore(inventoryItems);
      const final_dqs = computeFinalDqs(base_score, method_score);
      return ok({
        job_id: args.job_id,
        row_count: rows.length,
        inventory_item_count: inventoryItems.length,
        base_score: Math.round(base_score * 1000) / 1000,
        method_score: Math.round(method_score * 1000) / 1000,
        final_dqs: Math.round(final_dqs * 1000) / 1000,
        missing_rates,
        currency_count,
        formula: 'final_dqs = clamp(0.7 * base_score + 0.3 * method_score, 0, 1)',
      });
    }

    // ── Ingest ──
    case 'calc.ingest': {
      if (!args || typeof args.filename !== 'string') return fail('Missing filename');
      if (!Array.isArray(args.rows)) return fail('Missing rows array');
      const result = runIngest(args.filename, args.rows, args.reporting_currency);
      if (result.error) return fail(result);
      return ok(result);
    }

    // ── Export ──
    case 'calc.export': {
      if (!args || typeof args.job_id !== 'string') return fail('Missing job_id');
      const fmt = args.format === 'csv' ? 'csv' : 'json';
      const result = runExport(args.job_id, fmt);
      if (result.error) return fail(result);
      return ok(result);
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

  // Notification: no response.
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
            'Scope3 Calculation MCP server. Exposes DB CRUD, emissions compute (method hierarchy), FX normalization, DQS scoring, ingestion, and export tools.',
        });
      }
      case 'tools/list': {
        return jsonRpcResult(id, { ...listTools(), nextCursor: null });
      }
      case 'tools/call': {
        const name = msg.params && msg.params.name;
        const args = msg.params && (msg.params.arguments || msg.params.args);
        if (typeof name !== 'string') {
          return jsonRpcError(id, -32602, 'Invalid params: missing tool name');
        }
        const result = await callTool(name, args);
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
  // Default (should be overridden in stdio mode)
  handleMessage(msg).then((resp) => { if (resp) write(resp); }).catch(() => {});
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
      // Best-effort: parse errors get a response with null id.
      write(jsonRpcError(null, -32700, 'Parse error'));
      continue;
    }
    enqueueMessage(parsed);
  }
}

// ─── Transport selection (stdio vs HTTP) ──────────────────────────────────────

const transport = (process.env.CARBONKIT_MCP_TRANSPORT || 'stdio').toLowerCase();

if (transport === 'http') {
  const { startHttpTransport } = require('../../shared-services/tools/mcp-http-transport');
  const port = process.env.CARBONKIT_MCP_PORT || process.env.CARBONKIT_CALC_PORT || 8401;
  startHttpTransport(handleMessage, null, port, { serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
} else {
  // Serialize request handling to avoid interleaved stdout frames.
  let _queue = Promise.resolve();
  enqueueMessage = function enqueueMessage(msg) {
    _queue = _queue.then(async () => {
      const resp = await handleMessage(msg);
      if (resp) write(resp);
    }).catch((err) => {
      try {
        const id = msg && Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
        write(jsonRpcError(id, -32603, 'Internal error', { message: err.message || String(err) }));
      } catch (_e) { /* ignore */ }
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
