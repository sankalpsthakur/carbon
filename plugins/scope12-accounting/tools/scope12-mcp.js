#!/usr/bin/env node
'use strict';

// Scope 1/2 Accounting MCP Server (Model Context Protocol) - stdio transport.
// Implements: initialize, tools/list, tools/call
// Transport framing: LSP-style headers with Content-Length.
// No external dependencies - Node built-ins only.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Plugin manifest
// ---------------------------------------------------------------------------
const MANIFEST_PATH = path.resolve(__dirname, '..', '.claude-plugin', 'plugin.json');

function readPluginManifest() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed?.name === 'string' ? parsed.name : 'scope12-accounting',
      version: typeof parsed?.version === 'string' ? parsed.version : '0.0.0',
    };
  } catch (_err) {
    return { name: 'scope12-accounting', version: '0.0.0' };
  }
}

const PLUGIN = readPluginManifest();
const SERVER_NAME = `${PLUGIN.name}-mcp`;
const SERVER_VERSION = PLUGIN.version;

// ---------------------------------------------------------------------------
// Store (unified adapter)
// ---------------------------------------------------------------------------
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const { createStore } = require('../../shared-services/tools/store-adapter');
const store = createStore({ dataDir: DATA_DIR, serverName: SERVER_NAME });

// ---------------------------------------------------------------------------
// Reference data loaders
// ---------------------------------------------------------------------------
function loadJSON(filename) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
  } catch (_e) {
    return null;
  }
}

const GWP_TABLES = {
  AR5: loadJSON('gwp_ar5.json'),
  AR6: loadJSON('gwp_ar6.json'),
};

const COMBUSTION_FACTORS = loadJSON('combustion_factors.json');
const GRID_FACTORS = loadJSON('grid_factors_2024.json');
const REFRIGERANT_GWP = loadJSON('refrigerant_gwp.json');

function getGWP(gasName, gwpVersion) {
  const ver = (gwpVersion || 'AR6').toUpperCase();
  const table = GWP_TABLES[ver];
  if (table) {
    const gases = table.gases || {};
    const entry = gases[gasName];
    if (entry != null) {
      if (typeof entry === 'number') return entry;
      if (typeof entry === 'object' && typeof entry.gwp100 === 'number') return entry.gwp100;
    }
  }
  // Fallback to refrigerant GWP table
  if (REFRIGERANT_GWP && REFRIGERANT_GWP.refrigerants) {
    const ref = REFRIGERANT_GWP.refrigerants[gasName];
    if (ref && typeof ref.gwp100 === 'number') return ref.gwp100;
  }
  return null;
}

function getCombustionFactor(fuelKey) {
  if (!COMBUSTION_FACTORS) return null;
  return COMBUSTION_FACTORS.fuels?.[fuelKey] || null;
}

function getGridFactor(regionCode) {
  if (!GRID_FACTORS) return null;
  return GRID_FACTORS.regions?.[regionCode] || null;
}

// ---------------------------------------------------------------------------
// Scope 1 Engine
// ---------------------------------------------------------------------------

/**
 * Stationary combustion: E = activity * (EF_CO2_fossil + EF_CH4 * GWP_CH4 + EF_N2O * GWP_N2O)
 * Biogenic CO2 tracked separately.
 */
function computeStationary(entries, gwpVersion) {
  let totalFossil = 0;
  let totalBiogenic = 0;
  const items = [];

  for (const e of entries) {
    const factor = getCombustionFactor(e.fuel_type);
    if (!factor) {
      items.push({ ...e, error: `Unknown fuel_type: ${e.fuel_type}` });
      continue;
    }
    const activity = e.quantity || 0;
    const gwpCH4 = getGWP('CH4', gwpVersion) || 28;
    const gwpN2O = getGWP('N2O', gwpVersion) || 265;

    const co2Fossil = activity * (factor.kgCO2_per_unit || 0);
    const ch4CO2e = activity * (factor.kgCH4_per_unit || 0) * gwpCH4;
    const n2oCO2e = activity * (factor.kgN2O_per_unit || 0) * gwpN2O;
    const fossilCO2e = co2Fossil + ch4CO2e + n2oCO2e;
    const biogenic = activity * (factor.kgCO2_biogenic_per_unit || 0);

    totalFossil += fossilCO2e;
    totalBiogenic += biogenic;

    items.push({
      source_id: e.source_id || null,
      fuel_type: e.fuel_type,
      quantity: activity,
      unit: factor.unit,
      kgCO2e_fossil: round(fossilCO2e),
      kgCO2_biogenic: round(biogenic),
      breakdown: { kgCO2_fossil: round(co2Fossil), kgCH4_CO2e: round(ch4CO2e), kgN2O_CO2e: round(n2oCO2e) },
    });
  }

  return { category: 'stationary', kgCO2e_fossil: round(totalFossil), kgCO2_biogenic: round(totalBiogenic), items };
}

/**
 * Mobile combustion: same formula, different fuel types tagged as mobile.
 */
function computeMobile(entries, gwpVersion) {
  let totalFossil = 0;
  let totalBiogenic = 0;
  const items = [];

  for (const e of entries) {
    const factor = getCombustionFactor(e.fuel_type);
    if (!factor) {
      items.push({ ...e, error: `Unknown fuel_type: ${e.fuel_type}` });
      continue;
    }
    const activity = e.quantity || 0;
    const gwpCH4 = getGWP('CH4', gwpVersion) || 28;
    const gwpN2O = getGWP('N2O', gwpVersion) || 265;

    const co2Fossil = activity * (factor.kgCO2_per_unit || 0);
    const ch4CO2e = activity * (factor.kgCH4_per_unit || 0) * gwpCH4;
    const n2oCO2e = activity * (factor.kgN2O_per_unit || 0) * gwpN2O;
    const fossilCO2e = co2Fossil + ch4CO2e + n2oCO2e;
    const biogenic = activity * (factor.kgCO2_biogenic_per_unit || 0);

    totalFossil += fossilCO2e;
    totalBiogenic += biogenic;

    items.push({
      source_id: e.source_id || null,
      fuel_type: e.fuel_type,
      quantity: activity,
      unit: factor.unit,
      kgCO2e_fossil: round(fossilCO2e),
      kgCO2_biogenic: round(biogenic),
    });
  }

  return { category: 'mobile', kgCO2e_fossil: round(totalFossil), kgCO2_biogenic: round(totalBiogenic), items };
}

/**
 * Process emissions: E = process_activity * EF_process
 */
function computeProcess(entries) {
  let total = 0;
  const items = [];

  for (const e of entries) {
    const kgCO2e = (e.quantity || 0) * (e.emission_factor || 0);
    total += kgCO2e;
    items.push({
      source_id: e.source_id || null,
      process: e.process || 'unknown',
      quantity: e.quantity || 0,
      unit: e.unit || 'unit',
      emission_factor: e.emission_factor || 0,
      kgCO2e: round(kgCO2e),
    });
  }

  return { category: 'process', kgCO2e: round(total), items };
}

/**
 * Fugitive emissions (refrigerants):
 * Leakage_kg = inventory_begin + purchases - inventory_end - returned_for_reclaim
 * E = Leakage_kg * GWP_gas
 */
function computeFugitive(entries, gwpVersion) {
  let total = 0;
  const items = [];

  for (const e of entries) {
    const leakage = (e.inventory_begin || 0) + (e.purchases || 0) - (e.inventory_end || 0) - (e.returned_for_reclaim || 0);
    const gwp = getGWP(e.gas || e.refrigerant, gwpVersion);
    if (gwp == null) {
      items.push({ ...e, leakage_kg: round(leakage), error: `Unknown gas GWP: ${e.gas || e.refrigerant}` });
      continue;
    }
    const kgCO2e = Math.max(0, leakage) * gwp;
    total += kgCO2e;
    items.push({
      source_id: e.source_id || null,
      gas: e.gas || e.refrigerant,
      leakage_kg: round(leakage),
      gwp,
      kgCO2e: round(kgCO2e),
    });
  }

  return { category: 'fugitive', kgCO2e: round(total), items };
}

// ---------------------------------------------------------------------------
// Scope 1 Calculate (gate-checked, typed sources)
// ---------------------------------------------------------------------------

const VALID_UNITS = { m3: true, liter: true, kg: true, MMBtu: true };

function scope1Calculate(args) {
  const sources = args.sources || [];
  const gwpVer = (args.gwp_version || 'AR6').toUpperCase();
  const gateFailures = [];

  // Global gates
  if (args.uses_proxy && !args.proxy_waiver) {
    gateFailures.push({ gate: 'PROXY_WITHOUT_WAIVER', detail: 'Proxy data used without waiver' });
  }
  if (args.dq_score != null && args.dq_score > 3.0 && !args.dq_waiver) {
    gateFailures.push({ gate: 'DQ_SCORE', detail: `DQ score ${args.dq_score} exceeds threshold 3.0` });
  }

  let totalKgCO2e = 0;
  let totalBiogenicKg = 0;
  const byGas = { CO2: 0, CH4: 0, N2O: 0 };
  const bySource = [];

  for (const src of sources) {
    const srcType = src.type;

    if (srcType === 'stationary_combustion' || srcType === 'mobile_combustion') {
      const fuel = src.fuel;
      const volume = src.volume || 0;
      const unit = src.unit;

      if (!VALID_UNITS[unit]) {
        gateFailures.push({ gate: 'UNKNOWN_UNIT', detail: `Unknown unit: ${unit}`, source: src });
        bySource.push({ type: srcType, tco2e: 0, error: `UNKNOWN_UNIT: ${unit}` });
        continue;
      }

      const factor = getCombustionFactor(fuel);
      if (!factor) {
        gateFailures.push({ gate: 'MISSING_FUEL', detail: `Unknown fuel: ${fuel}`, source: src });
        bySource.push({ type: srcType, tco2e: 0, error: `Unknown fuel: ${fuel}` });
        continue;
      }

      const gwpCH4 = getGWP('CH4', gwpVer) || 28;
      const gwpN2O = getGWP('N2O', gwpVer) || 265;

      const kgCO2 = volume * (factor.kgCO2_per_unit || 0);
      const kgCH4 = volume * (factor.kgCH4_per_unit || 0);
      const kgN2O = volume * (factor.kgN2O_per_unit || 0);
      const biogenic = volume * (factor.kgCO2_biogenic_per_unit || 0);

      const co2e_CO2 = kgCO2 * 1; // GWP of CO2 = 1
      const co2e_CH4 = kgCH4 * gwpCH4;
      const co2e_N2O = kgN2O * gwpN2O;
      const srcTotal = co2e_CO2 + co2e_CH4 + co2e_N2O;

      byGas.CO2 += co2e_CO2;
      byGas.CH4 += co2e_CH4;
      byGas.N2O += co2e_N2O;
      totalKgCO2e += srcTotal;
      totalBiogenicKg += biogenic;

      bySource.push({ type: srcType, fuel, volume, unit, tco2e: round(srcTotal / 1000), biogenic_tco2e: round(biogenic / 1000) });
    } else if (srcType === 'process_emissions') {
      const activityData = src.activity_data || 0;
      const processEf = src.process_ef || 0;
      const gas = src.gas || 'CO2';

      const gwp = getGWP(gas, gwpVer);
      if (gwp == null) {
        gateFailures.push({ gate: 'MISSING_GWP', detail: `Unknown gas GWP: ${gas}`, source: src });
        bySource.push({ type: srcType, tco2e: 0, error: `MISSING_GWP: ${gas}` });
        continue;
      }

      const kgCO2e = activityData * processEf * gwp;
      totalKgCO2e += kgCO2e;
      if (gas === 'CO2') byGas.CO2 += kgCO2e;
      else if (gas === 'CH4') byGas.CH4 += kgCO2e;
      else if (gas === 'N2O') byGas.N2O += kgCO2e;

      bySource.push({ type: srcType, gas, activity_data: activityData, process_ef: processEf, tco2e: round(kgCO2e / 1000) });
    } else if (srcType === 'fugitive_emissions') {
      const gas = src.gas;
      const charge = src.charge || 0;
      const recoveryRate = src.recovery_rate || 0;
      const leakage = charge * (1 - recoveryRate);

      const gwp = getGWP(gas, gwpVer);
      if (gwp == null) {
        gateFailures.push({ gate: 'MISSING_GWP', detail: `Unknown gas GWP: ${gas}`, source: src });
        bySource.push({ type: srcType, tco2e: 0, error: `MISSING_GWP: ${gas}` });
        continue;
      }

      const kgCO2e = Math.max(0, leakage) * gwp;
      totalKgCO2e += kgCO2e;

      bySource.push({ type: srcType, gas, charge, recovery_rate: recoveryRate, leakage_kg: round(leakage), tco2e: round(kgCO2e / 1000) });
    }
  }

  const gatesPassed = gateFailures.length === 0;

  return {
    gates_passed: gatesPassed,
    gate_failures: gateFailures,
    total_tco2e: round(totalKgCO2e / 1000),
    biogenic_tco2e: round(totalBiogenicKg / 1000),
    by_gas: {
      CO2: round(byGas.CO2 / 1000),
      CH4: round(byGas.CH4 / 1000),
      N2O: round(byGas.N2O / 1000),
    },
    by_source: bySource,
  };
}

// ---------------------------------------------------------------------------
// Scope 2 Calculate (gate-checked, typed entries)
// ---------------------------------------------------------------------------

function scope2Calculate(args) {
  const entries = args.entries || [];
  const method = (args.method || 'both').toLowerCase();
  const resultEntries = [];
  let locationBasedTotal = 0;
  let marketBasedTotal = 0;
  const hierarchyApplied = [];

  for (const e of entries) {
    const region = e.grid_region;
    let kwh = e.kwh || 0;
    const unit = e.unit;

    // Unit normalization
    if (unit === 'MWh') kwh = kwh * 1000;
    else if (unit === 'GJ') kwh = kwh * 277.777778;
    else if (unit === 'MMBtu') kwh = kwh * 293.071070;

    // On-site generation
    const onSite = e.on_site_generation_kwh || 0;
    const netImport = Math.max(0, kwh - onSite);

    const gridFactor = getGridFactor(region);
    const entryResult = { grid_region: region, kwh: e.kwh, net_import_kwh: netImport };

    // Location-based
    if (method === 'location' || method === 'both') {
      if (gridFactor) {
        const lb = netImport * gridFactor.kgco2e_per_kwh;
        locationBasedTotal += lb;
        entryResult.location_based_kgco2e = round(lb);
      }
    }

    // Market-based
    if (method === 'market' || method === 'both') {
      const instrument = e.instrument;
      if (instrument && instrument.ownership_status === 'owned_and_retired') {
        // Contractual: use instrument
        const matchedKwh = Math.min(netImport, instrument.quantity_kwh || netImport);
        const unmatchedKwh = Math.max(0, netImport - matchedKwh);
        const matchedEmissions = matchedKwh * (instrument.ef || 0);
        const residualEf = e.residual_mix_ef || 0;
        const unmatchedEmissions = unmatchedKwh * residualEf;
        marketBasedTotal += matchedEmissions + unmatchedEmissions;
        hierarchyApplied.push({ step: 'contractual', region, matched_kwh: matchedKwh });
        entryResult.market_based_kgco2e = round(matchedEmissions + unmatchedEmissions);
      } else if (e.residual_mix_ef != null) {
        // Residual mix fallback
        const mb = netImport * e.residual_mix_ef;
        marketBasedTotal += mb;
        hierarchyApplied.push({ step: 'residual_mix', region });
        entryResult.market_based_kgco2e = round(mb);
      } else {
        // No instrument and no residual mix → 0
        entryResult.market_based_kgco2e = 0;
      }
    }

    resultEntries.push(entryResult);
  }

  const result = { entries: resultEntries, method_hierarchy_applied: hierarchyApplied };

  if (method === 'location' || method === 'both') {
    result.location_based_tco2e = round(locationBasedTotal / 1000);
  }
  if (method === 'market' || method === 'both') {
    result.market_based_tco2e = round(marketBasedTotal / 1000);
  }

  return result;
}

// ---------------------------------------------------------------------------
// KPI Normalize
// ---------------------------------------------------------------------------

function kpiNormalize(args) {
  const total = args.total_tco2e || 0;
  const kpis = {};
  const warnings = [];

  if (args.revenue_musd && args.revenue_musd > 0) {
    kpis.revenue_intensity = round(total / args.revenue_musd);
  }
  if (args.units_produced && args.units_produced > 0) {
    kpis.unit_intensity = round((total * 1000) / args.units_produced);
  }
  if (args.fte && args.fte > 0) {
    kpis.fte_intensity = round(total / args.fte);
  }
  if (args.floor_area_m2 && args.floor_area_m2 > 0) {
    kpis.floor_area_intensity = round((total * 1000) / args.floor_area_m2);
  }
  if (args.energy_mwh && args.energy_mwh > 0) {
    kpis.energy_intensity = round(total / args.energy_mwh);
  }

  // Coverage ratio
  let coverageRatio = null;
  if (args.estimated_total && args.estimated_total > 0 && args.measured_total != null) {
    coverageRatio = args.measured_total / args.estimated_total;
    if (coverageRatio < 0.50) {
      warnings.push(`FAIL: Coverage ratio ${round(coverageRatio)} below 0.50 threshold`);
    } else if (coverageRatio < 0.80) {
      warnings.push(`WARN: Coverage ratio ${round(coverageRatio)} below 0.80 threshold`);
    }
  }

  // Base-year indexing
  let baseYearIndex = null;
  if (args.base_year_values && typeof args.base_year_values === 'object') {
    baseYearIndex = {};
    for (const [key, baseValue] of Object.entries(args.base_year_values)) {
      if (kpis[key] != null && baseValue > 0) {
        baseYearIndex[key] = round((kpis[key] / baseValue) * 100);
      }
    }
  }

  const result = { kpis, warnings };
  if (coverageRatio != null) result.coverage_ratio = round(coverageRatio);
  if (baseYearIndex) result.base_year_index = baseYearIndex;
  return result;
}

// ---------------------------------------------------------------------------
// Report Export
// ---------------------------------------------------------------------------

function reportExport(args) {
  const s1 = args.scope1_results || {};
  const s2 = args.scope2_results || {};
  const format = args.format || 'json';

  const scope1 = s1.total_tco2e || 0;
  const lb = s2.location_based_tco2e || 0;
  const mb = s2.market_based_tco2e || 0;

  if (format === 'summary') {
    const lines = [
      `Scope 1: ${scope1} tCO2e`,
      `Scope 2 (Location-based): ${lb} tCO2e`,
      `Scope 2 (Market-based): ${mb} tCO2e`,
      `Total (Location-based): ${scope1 + lb} tCO2e`,
      `Total (Market-based): ${scope1 + mb} tCO2e`,
    ];
    if (s1.biogenic_tco2e) lines.push(`Biogenic CO2: ${s1.biogenic_tco2e} tCO2e`);
    return lines.join('\n');
  }

  return {
    scope1_results: s1,
    scope2_results: s2,
    tie_out: {
      scope1_tco2e: scope1,
      scope2_lb_tco2e: lb,
      scope2_mb_tco2e: mb,
      total_lb_tco2e: scope1 + lb,
      total_mb_tco2e: scope1 + mb,
    },
  };
}

// ---------------------------------------------------------------------------
// Period Close
// ---------------------------------------------------------------------------

function periodClose(args) {
  const period = args.period;
  const orgId = args.org_id || 'unknown';
  if (!period) return { error: true, message: 'Missing period' };

  // Check for existing closed period
  const existing = store.get('closed_periods', { period, org_id: orgId });
  if (existing) {
    return { error: true, message: `Period ${period} already closed for ${orgId}` };
  }

  // Restatement validation
  if (args.restatement) {
    const requiredFields = [
      'approver', 'reason', 'original_period', 'original_sha256',
      'changed_scope1', 'changed_scope2', 'change_description',
      'materiality_assessment', 'review_date', 'reviewer',
      'supporting_evidence', 'notification_date', 'affected_reports',
      'correction_methodology', 'restatement_sha256',
    ];
    const missing = requiredFields.filter(f => !args.restatement[f]);
    if (missing.length > 0) {
      return { error: true, message: 'Restatement missing required fields', details: { missing_fields: missing } };
    }
  }

  const record = {
    period,
    org_id: orgId,
    status: 'CLOSED',
    closed_by: args.closed_by || 'system',
    closed_at: nowISO(),
  };

  const recordJSON = JSON.stringify(record);
  record.sha256 = sha256Hex(recordJSON);

  store.set('closed_periods', { _id: `${orgId}::${period}`, ...record });

  return { status: 'CLOSED', sha256: record.sha256, period, org_id: orgId };
}

// ---------------------------------------------------------------------------
// DQ Score
// ---------------------------------------------------------------------------

function dqScore(args) {
  const dims = args.dimensions || {};
  const requiredDims = ['completeness', 'accuracy', 'consistency', 'timeliness', 'transparency'];
  const values = [];

  for (const d of requiredDims) {
    const v = dims[d];
    if (v == null || v < 1 || v > 5) {
      return { error: true, message: `Invalid dimension value for ${d}: ${v}. Must be 1-5.` };
    }
    values.push(v);
  }

  const weights = args.weights || requiredDims.map(() => 1 / requiredDims.length);
  let finalScore = 0;
  for (let i = 0; i < values.length; i++) {
    finalScore += values[i] * (weights[i] || 1 / requiredDims.length);
  }
  finalScore = round(finalScore);

  let grade;
  if (finalScore <= 2) grade = 'HIGH';
  else if (finalScore <= 3) grade = 'MEDIUM';
  else grade = 'LOW';

  return {
    final_score: finalScore,
    grade,
    dimensions: dims,
  };
}

// ---------------------------------------------------------------------------
// Evidence Validate
// ---------------------------------------------------------------------------

const EVIDENCE_REQUIRED_FIELDS = [
  'certificate_id', 'issuer', 'generation_source', 'generation_period_start',
  'generation_period_end', 'generation_mwh', 'technology', 'location',
  'grid_region', 'retirement_date', 'retirement_registry', 'ownership_status',
  'beneficiary', 'vintage_year', 'tracking_system', 'verification_standard',
];

function evidenceValidate(args) {
  const evidence = args.evidence || {};
  const missingFields = EVIDENCE_REQUIRED_FIELDS.filter(f => evidence[f] == null && evidence[f] !== 0);
  const gateFailures = [];

  if (evidence.ownership_status && evidence.ownership_status !== 'owned_and_retired') {
    gateFailures.push({ gate: 'OWNERSHIP_STATUS', detail: `ownership_status is '${evidence.ownership_status}', must be 'owned_and_retired'` });
  }

  const valid = missingFields.length === 0 && gateFailures.length === 0;

  return { valid, missing_fields: missingFields, gate_failures: gateFailures };
}

// ---------------------------------------------------------------------------
// Scope 2 Engine (Dual-Ledger)
// ---------------------------------------------------------------------------

const UNIT_TO_KWH = {
  kWh: 1,
  MWh: 1000,
  GJ: 277.777778,
  MMBtu: 293.071070,
};

function toKWh(value, unit) {
  const factor = UNIT_TO_KWH[unit];
  if (factor == null) return null;
  return value * factor;
}

/**
 * Location-based: E = kWh * grid_factor(region)
 */
function computeScope2LocationBased(entries) {
  let total = 0;
  const items = [];

  for (const e of entries) {
    const kwh = toKWh(e.quantity || 0, e.unit || 'kWh');
    if (kwh == null) {
      items.push({ ...e, error: `Cannot convert unit: ${e.unit}` });
      continue;
    }
    // Net import
    const exported = toKWh(e.exported || 0, e.unit || 'kWh') || 0;
    const netKwh = Math.max(0, kwh - exported);

    const gridFactor = getGridFactor(e.region);
    if (!gridFactor) {
      items.push({ ...e, net_kwh: round(netKwh), error: `Unknown grid region: ${e.region}` });
      continue;
    }

    const kgCO2e = netKwh * gridFactor.kgco2e_per_kwh;
    total += kgCO2e;

    items.push({
      source_id: e.source_id || null,
      energy_carrier: e.energy_carrier || 'electricity',
      region: e.region,
      quantity: e.quantity,
      unit: e.unit || 'kWh',
      net_kwh: round(netKwh),
      grid_factor: gridFactor.kgco2e_per_kwh,
      kgCO2e: round(kgCO2e),
    });
  }

  return { method: 'location_based', kgCO2e: round(total), items };
}

/**
 * Market-based: matched kWh use contract factor, unmatched use residual mix factor.
 */
function computeScope2MarketBased(entries) {
  let total = 0;
  const items = [];

  for (const e of entries) {
    const kwh = toKWh(e.quantity || 0, e.unit || 'kWh');
    if (kwh == null) {
      items.push({ ...e, error: `Cannot convert unit: ${e.unit}` });
      continue;
    }
    const exported = toKWh(e.exported || 0, e.unit || 'kWh') || 0;
    const netKwh = Math.max(0, kwh - exported);

    const matchedKwh = Math.min(netKwh, e.matched_kwh || 0);
    const unmatchedKwh = Math.max(0, netKwh - matchedKwh);

    const contractFactor = e.contract_factor_kgco2e_per_kwh || 0;
    const residualFactor = e.residual_mix_factor_kgco2e_per_kwh;
    const fallbackRegion = getGridFactor(e.region);
    const unmatchedFactor = residualFactor != null ? residualFactor : (fallbackRegion?.kgco2e_per_kwh || 0);

    const matchedEmissions = matchedKwh * contractFactor;
    const unmatchedEmissions = unmatchedKwh * unmatchedFactor;
    const kgCO2e = matchedEmissions + unmatchedEmissions;
    total += kgCO2e;

    items.push({
      source_id: e.source_id || null,
      energy_carrier: e.energy_carrier || 'electricity',
      region: e.region,
      net_kwh: round(netKwh),
      matched_kwh: round(matchedKwh),
      unmatched_kwh: round(unmatchedKwh),
      contract_factor: contractFactor,
      unmatched_factor: unmatchedFactor,
      kgCO2e_matched: round(matchedEmissions),
      kgCO2e_unmatched: round(unmatchedEmissions),
      kgCO2e: round(kgCO2e),
      coverage_pct: netKwh > 0 ? round((matchedKwh / netKwh) * 100) : 0,
      evidence_ids: e.evidence_ids || [],
    });
  }

  return { method: 'market_based', kgCO2e: round(total), items };
}

// ---------------------------------------------------------------------------
// KPI Normalization
// ---------------------------------------------------------------------------
function computeKPIs(scope1Total, scope2LB, scope2MB, denominators) {
  const kpis = [];
  const s12LB = scope1Total + scope2LB;
  const s12MB = scope1Total + scope2MB;

  if (denominators.revenue) {
    const revMUSD = denominators.revenue / 1_000_000;
    if (revMUSD > 0) {
      kpis.push({
        name: 'tCO2e_per_mUSD_revenue_LB',
        value: round((s12LB / 1000) / revMUSD),
        scope: 'scope12_location_based',
        denominator: 'revenue_mUSD',
        denominator_value: round(revMUSD),
      });
      kpis.push({
        name: 'tCO2e_per_mUSD_revenue_MB',
        value: round((s12MB / 1000) / revMUSD),
        scope: 'scope12_market_based',
        denominator: 'revenue_mUSD',
        denominator_value: round(revMUSD),
      });
    }
  }

  if (denominators.fte && denominators.fte > 0) {
    kpis.push({
      name: 'tCO2e_per_FTE_LB',
      value: round((s12LB / 1000) / denominators.fte),
      scope: 'scope12_location_based',
      denominator: 'fte',
      denominator_value: denominators.fte,
    });
    kpis.push({
      name: 'tCO2e_per_FTE_MB',
      value: round((s12MB / 1000) / denominators.fte),
      scope: 'scope12_market_based',
      denominator: 'fte',
      denominator_value: denominators.fte,
    });
  }

  if (denominators.floor_area_sqm && denominators.floor_area_sqm > 0) {
    kpis.push({
      name: 'kgCO2e_per_sqm_LB',
      value: round(s12LB / denominators.floor_area_sqm),
      scope: 'scope12_location_based',
      denominator: 'floor_area_sqm',
      denominator_value: denominators.floor_area_sqm,
    });
    kpis.push({
      name: 'kgCO2e_per_sqm_MB',
      value: round(s12MB / denominators.floor_area_sqm),
      scope: 'scope12_market_based',
      denominator: 'floor_area_sqm',
      denominator_value: denominators.floor_area_sqm,
    });
  }

  if (denominators.units_produced && denominators.units_produced > 0) {
    kpis.push({
      name: 'kgCO2e_per_unit_LB',
      value: round(s12LB / denominators.units_produced),
      scope: 'scope12_location_based',
      denominator: 'units_produced',
      denominator_value: denominators.units_produced,
    });
    kpis.push({
      name: 'kgCO2e_per_unit_MB',
      value: round(s12MB / denominators.units_produced),
      scope: 'scope12_market_based',
      denominator: 'units_produced',
      denominator_value: denominators.units_produced,
    });
  }

  return kpis;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function round(v, decimals) {
  const d = decimals || 6;
  return Math.round(v * 10 ** d) / 10 ** d;
}

function nowISO() {
  return new Date().toISOString();
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Full compute orchestrator
// ---------------------------------------------------------------------------
function runScope12Compute(args) {
  const gwpVersion = args.gwp_version || 'AR6';
  const period = args.period || 'unknown';
  const orgId = args.org_id || 'unknown';
  const runId = store._generateId();
  const ts = nowISO();

  // Scope 1
  const stationary = computeStationary(args.stationary || [], gwpVersion);
  const mobile = computeMobile(args.mobile || [], gwpVersion);
  const process_ = computeProcess(args.process || []);
  const fugitive = computeFugitive(args.fugitive || [], gwpVersion);

  const scope1Total = stationary.kgCO2e_fossil + mobile.kgCO2e_fossil + process_.kgCO2e + fugitive.kgCO2e;
  const scope1Biogenic = stationary.kgCO2_biogenic + mobile.kgCO2_biogenic;

  // Scope 2
  const scope2LB = computeScope2LocationBased(args.scope2 || []);
  const scope2MB = computeScope2MarketBased(args.scope2 || []);

  // Totals
  const scope12LB = scope1Total + scope2LB.kgCO2e;
  const scope12MB = scope1Total + scope2MB.kgCO2e;

  // KPIs
  const kpis = computeKPIs(scope1Total, scope2LB.kgCO2e, scope2MB.kgCO2e, args.denominators || {});

  const result = {
    run_id: runId,
    org_id: orgId,
    period,
    gwp_version: gwpVersion,
    computed_at: ts,
    scope1: {
      stationary,
      mobile,
      process: process_,
      fugitive,
      total_kgCO2e: round(scope1Total),
      total_tCO2e: round(scope1Total / 1000),
      biogenic_kgCO2: round(scope1Biogenic),
    },
    scope2: {
      location_based: scope2LB,
      market_based: scope2MB,
    },
    totals: {
      scope12_location_based_kgCO2e: round(scope12LB),
      scope12_location_based_tCO2e: round(scope12LB / 1000),
      scope12_market_based_kgCO2e: round(scope12MB),
      scope12_market_based_tCO2e: round(scope12MB / 1000),
    },
    kpis,
  };

  // Persist the run
  store.set('scope12_runs', { _id: runId, ...result });

  return result;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
function runExport(runId, format) {
  const run = store.get('scope12_runs', { _id: runId });
  if (!run) return { error: true, code: 'NOT_FOUND', message: `Run not found: ${runId}` };

  if (format === 'csv') {
    const lines = ['category,source_id,item,kgCO2e,unit'];
    for (const item of run.scope1?.stationary?.items || []) {
      lines.push(`stationary,${item.source_id || ''},${item.fuel_type},${item.kgCO2e_fossil},${item.unit}`);
    }
    for (const item of run.scope1?.mobile?.items || []) {
      lines.push(`mobile,${item.source_id || ''},${item.fuel_type},${item.kgCO2e_fossil},${item.unit}`);
    }
    for (const item of run.scope1?.process?.items || []) {
      lines.push(`process,${item.source_id || ''},${item.process},${item.kgCO2e},${item.unit}`);
    }
    for (const item of run.scope1?.fugitive?.items || []) {
      lines.push(`fugitive,${item.source_id || ''},${item.gas},${item.kgCO2e},kg`);
    }
    for (const item of run.scope2?.location_based?.items || []) {
      lines.push(`scope2_lb,${item.source_id || ''},${item.region},${item.kgCO2e},kWh`);
    }
    for (const item of run.scope2?.market_based?.items || []) {
      lines.push(`scope2_mb,${item.source_id || ''},${item.region},${item.kgCO2e},kWh`);
    }
    return { format: 'csv', content: lines.join('\n'), run_id: runId };
  }

  return { format: 'json', content: JSON.stringify(run, null, 2), run_id: runId };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
function getTools() {
  return [
    {
      name: 'scope12.health',
      description: 'Returns plugin name/version, server timestamp, and available reference data.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'scope12.compute',
      description: 'Run the full Scope 1/2 emissions calculation engine. Accepts activity data for stationary combustion, mobile combustion, process emissions, fugitive refrigerants, and purchased energy. Returns dual-ledger Scope 2 (location-based + market-based), Scope 1 totals with biogenic separation, and KPI intensity metrics.',
      inputSchema: {
        type: 'object',
        properties: {
          org_id: { type: 'string', description: 'Organization identifier.' },
          period: { type: 'string', description: 'Reporting period (e.g. "2024").' },
          gwp_version: { type: 'string', enum: ['AR5', 'AR6'], description: 'GWP table version. Default AR6.' },
          stationary: {
            type: 'array', description: 'Stationary combustion entries.',
            items: {
              type: 'object', properties: {
                source_id: { type: 'string' }, fuel_type: { type: 'string' }, quantity: { type: 'number' },
              }, required: ['fuel_type', 'quantity'],
            },
          },
          mobile: {
            type: 'array', description: 'Mobile combustion entries.',
            items: {
              type: 'object', properties: {
                source_id: { type: 'string' }, fuel_type: { type: 'string' }, quantity: { type: 'number' },
              }, required: ['fuel_type', 'quantity'],
            },
          },
          process: {
            type: 'array', description: 'Process emission entries.',
            items: {
              type: 'object', properties: {
                source_id: { type: 'string' }, process: { type: 'string' },
                quantity: { type: 'number' }, unit: { type: 'string' }, emission_factor: { type: 'number' },
              }, required: ['quantity', 'emission_factor'],
            },
          },
          fugitive: {
            type: 'array', description: 'Fugitive refrigerant entries (mass balance).',
            items: {
              type: 'object', properties: {
                source_id: { type: 'string' }, gas: { type: 'string' },
                inventory_begin: { type: 'number' }, purchases: { type: 'number' },
                inventory_end: { type: 'number' }, returned_for_reclaim: { type: 'number' },
              }, required: ['gas'],
            },
          },
          scope2: {
            type: 'array', description: 'Scope 2 purchased energy entries (used for both LB and MB).',
            items: {
              type: 'object', properties: {
                source_id: { type: 'string' }, energy_carrier: { type: 'string' },
                region: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' },
                exported: { type: 'number' },
                matched_kwh: { type: 'number' }, contract_factor_kgco2e_per_kwh: { type: 'number' },
                residual_mix_factor_kgco2e_per_kwh: { type: 'number' },
                evidence_ids: { type: 'array', items: { type: 'string' } },
              }, required: ['region', 'quantity'],
            },
          },
          denominators: {
            type: 'object', description: 'KPI denominators.', properties: {
              revenue: { type: 'number', description: 'Revenue in reporting currency.' },
              fte: { type: 'number', description: 'Full-time equivalent headcount.' },
              floor_area_sqm: { type: 'number', description: 'Total floor area in sqm.' },
              units_produced: { type: 'number', description: 'Units of output produced.' },
            },
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.scope1',
      description: 'Compute Scope 1 only (stationary + mobile + process + fugitive).',
      inputSchema: {
        type: 'object',
        properties: {
          gwp_version: { type: 'string', enum: ['AR5', 'AR6'] },
          stationary: { type: 'array', items: { type: 'object' } },
          mobile: { type: 'array', items: { type: 'object' } },
          process: { type: 'array', items: { type: 'object' } },
          fugitive: { type: 'array', items: { type: 'object' } },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.scope2',
      description: 'Compute Scope 2 only (dual-ledger: location-based + market-based).',
      inputSchema: {
        type: 'object',
        properties: {
          entries: { type: 'array', items: { type: 'object' }, description: 'Purchased energy entries.' },
        },
        required: ['entries'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.factors.combustion',
      description: 'List available combustion emission factors.',
      inputSchema: {
        type: 'object',
        properties: { fuel_type: { type: 'string', description: 'Filter by fuel type key.' } },
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.factors.grid',
      description: 'List available grid emission factors by region.',
      inputSchema: {
        type: 'object',
        properties: { region: { type: 'string', description: 'Filter by region code.' } },
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.factors.gwp',
      description: 'Look up GWP values for gases.',
      inputSchema: {
        type: 'object',
        properties: {
          gas: { type: 'string', description: 'Gas name (e.g. CH4, HFC-134a).' },
          version: { type: 'string', enum: ['AR5', 'AR6'], description: 'GWP table version.' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.runs.list',
      description: 'List stored computation runs.',
      inputSchema: {
        type: 'object',
        properties: {
          org_id: { type: 'string', description: 'Filter by organization.' },
          limit: { type: 'number', description: 'Max runs to return.' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.runs.get',
      description: 'Get a specific computation run by ID.',
      inputSchema: {
        type: 'object',
        properties: { run_id: { type: 'string', description: 'Run identifier.' } },
        required: ['run_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.export',
      description: 'Export a computation run as CSV or JSON.',
      inputSchema: {
        type: 'object',
        properties: {
          run_id: { type: 'string', description: 'Run identifier.' },
          format: { type: 'string', enum: ['csv', 'json'], description: 'Output format. Default json.' },
        },
        required: ['run_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.db.get',
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
      name: 'scope12.db.set',
      description: 'Upsert a document into a collection.',
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
      name: 'scope12.db.list',
      description: 'List documents from a collection.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name.' },
          query: { type: 'object', description: 'Optional filter.' },
          limit: { type: 'number', description: 'Max documents to return.' },
        },
        required: ['collection'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.db.delete',
      description: 'Delete documents matching query from a collection. Requires non-empty query.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name.' },
          query: { type: 'object', description: 'Non-empty query filter.' },
        },
        required: ['collection', 'query'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.db.bulkSet',
      description: 'Bulk upsert multiple documents into a collection.',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string', description: 'Collection name.' },
          docs: { type: 'array', items: { type: 'object' }, description: 'Documents to upsert.' },
        },
        required: ['collection', 'docs'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.sha256',
      description: 'Compute SHA-256 hash of text.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'Text to hash.' } },
        required: ['text'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.scope1.calculate',
      description: 'Calculate Scope 1 emissions with hard gates. Accepts typed source array.',
      inputSchema: {
        type: 'object',
        properties: {
          sources: { type: 'array', items: { type: 'object' }, description: 'Emission sources.' },
          gwp_version: { type: 'string', description: 'GWP table version (ar5 or ar6).' },
          uses_proxy: { type: 'boolean' },
          proxy_waiver: { type: 'boolean' },
          dq_score: { type: 'number' },
          dq_waiver: { type: 'boolean' },
        },
        required: ['sources'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.scope2.calculate',
      description: 'Calculate Scope 2 emissions with method selection and instrument hierarchy.',
      inputSchema: {
        type: 'object',
        properties: {
          entries: { type: 'array', items: { type: 'object' }, description: 'Energy entries.' },
          method: { type: 'string', enum: ['location', 'market', 'both'], description: 'Calculation method.' },
        },
        required: ['entries'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.kpi.normalize',
      description: 'Compute KPI intensity metrics with coverage ratio and base-year indexing.',
      inputSchema: {
        type: 'object',
        properties: {
          total_tco2e: { type: 'number' },
          revenue_musd: { type: 'number' },
          units_produced: { type: 'number' },
          fte: { type: 'number' },
          floor_area_m2: { type: 'number' },
          energy_mwh: { type: 'number' },
          measured_total: { type: 'number' },
          estimated_total: { type: 'number' },
          base_year_values: { type: 'object' },
        },
        required: ['total_tco2e'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.report.export',
      description: 'Export Scope 1/2 report with tie-outs in JSON or summary text format.',
      inputSchema: {
        type: 'object',
        properties: {
          scope1_results: { type: 'object' },
          scope2_results: { type: 'object' },
          format: { type: 'string', enum: ['json', 'summary'] },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.period.close',
      description: 'Close a reporting period with SHA-256 seal. Rejects double-close.',
      inputSchema: {
        type: 'object',
        properties: {
          period: { type: 'string' },
          org_id: { type: 'string' },
          closed_by: { type: 'string' },
          restatement: { type: 'object' },
        },
        required: ['period'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.dq.score',
      description: 'Compute weighted data quality score and grade.',
      inputSchema: {
        type: 'object',
        properties: {
          dimensions: { type: 'object', description: 'DQ dimensions (completeness, accuracy, consistency, timeliness, transparency). Each 1-5.' },
          weights: { type: 'array', items: { type: 'number' } },
        },
        required: ['dimensions'],
        additionalProperties: false,
      },
    },
    {
      name: 'scope12.evidence.validate',
      description: 'Validate 16-field EAC evidence with ownership gate.',
      inputSchema: {
        type: 'object',
        properties: {
          evidence: { type: 'object', description: 'Evidence record.' },
        },
        required: ['evidence'],
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

function toolJSON(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }], isError: false };
}

function toolError(msg) {
  return { content: [{ type: 'text', text: String(msg) }], isError: true };
}

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------
function callTool(toolName, args) {
  if (toolName === 'scope12.health') {
    return toolJSON({
      plugin: { name: PLUGIN.name, version: PLUGIN.version },
      server: { name: SERVER_NAME, version: SERVER_VERSION },
      timestamp: nowISO(),
      data_dir: DATA_DIR,
      reference_data: {
        gwp_ar5: GWP_TABLES.AR5 ? 'loaded' : 'missing',
        gwp_ar6: GWP_TABLES.AR6 ? 'loaded' : 'missing',
        grid_factors: GRID_FACTORS ? 'loaded' : 'missing',
        combustion_factors: COMBUSTION_FACTORS ? 'loaded' : 'missing',
        refrigerant_gwp: REFRIGERANT_GWP ? 'loaded' : 'missing',
      },
    });
  }

  if (toolName === 'scope12.compute') {
    const result = runScope12Compute(args || {});
    return toolJSON(result);
  }

  if (toolName === 'scope12.scope1') {
    const gwpVersion = args?.gwp_version || 'AR6';
    const stationary = computeStationary(args?.stationary || [], gwpVersion);
    const mobile = computeMobile(args?.mobile || [], gwpVersion);
    const process_ = computeProcess(args?.process || []);
    const fugitive = computeFugitive(args?.fugitive || [], gwpVersion);
    const total = stationary.kgCO2e_fossil + mobile.kgCO2e_fossil + process_.kgCO2e + fugitive.kgCO2e;
    const biogenic = stationary.kgCO2_biogenic + mobile.kgCO2_biogenic;
    return toolJSON({
      gwp_version: gwpVersion,
      stationary, mobile, process: process_, fugitive,
      total_kgCO2e: round(total), total_tCO2e: round(total / 1000),
      biogenic_kgCO2: round(biogenic),
    });
  }

  if (toolName === 'scope12.scope2') {
    const entries = args?.entries || [];
    const lb = computeScope2LocationBased(entries);
    const mb = computeScope2MarketBased(entries);
    return toolJSON({ location_based: lb, market_based: mb });
  }

  if (toolName === 'scope12.factors.combustion') {
    if (!COMBUSTION_FACTORS) return toolError('Combustion factors data not loaded');
    const fuels = COMBUSTION_FACTORS.fuels || {};
    if (args?.fuel_type) {
      const f = fuels[args.fuel_type];
      if (!f) return toolError(`Unknown fuel_type: ${args.fuel_type}`);
      return toolJSON({ fuel_type: args.fuel_type, ...f });
    }
    return toolJSON({ count: Object.keys(fuels).length, fuels });
  }

  if (toolName === 'scope12.factors.grid') {
    if (!GRID_FACTORS) return toolError('Grid factors data not loaded');
    const regions = GRID_FACTORS.regions || {};
    if (args?.region) {
      const r = regions[args.region];
      if (!r) return toolError(`Unknown region: ${args.region}`);
      return toolJSON({ region: args.region, ...r });
    }
    return toolJSON({ count: Object.keys(regions).length, regions });
  }

  if (toolName === 'scope12.factors.gwp') {
    const version = args?.version || 'AR6';
    if (args?.gas) {
      const gwp = getGWP(args.gas, version);
      if (gwp == null) return toolError(`Unknown gas: ${args.gas} in ${version}`);
      return toolJSON({ gas: args.gas, version, gwp100: gwp });
    }
    const table = GWP_TABLES[version];
    if (!table) return toolError(`Unknown GWP version: ${version}`);
    const gases = table.gases || {};
    const flat = {};
    for (const [k, v] of Object.entries(gases)) {
      flat[k] = typeof v === 'number' ? v : v?.gwp100 ?? v;
    }
    return toolJSON({ version, count: Object.keys(flat).length, gases: flat });
  }

  if (toolName === 'scope12.runs.list') {
    const query = args?.org_id ? { org_id: args.org_id } : {};
    const runs = store.list('scope12_runs', query, args?.limit);
    const summary = runs.map(r => ({
      run_id: r._id,
      org_id: r.org_id,
      period: r.period,
      scope1_tCO2e: r.scope1?.total_tCO2e,
      scope12_lb_tCO2e: r.totals?.scope12_location_based_tCO2e,
      scope12_mb_tCO2e: r.totals?.scope12_market_based_tCO2e,
      computed_at: r.computed_at,
    }));
    return toolJSON({ count: summary.length, runs: summary });
  }

  if (toolName === 'scope12.runs.get') {
    if (!args?.run_id) return toolError('Missing run_id');
    const run = store.get('scope12_runs', { _id: args.run_id });
    if (!run) return toolError(`Run not found: ${args.run_id}`);
    return toolJSON(run);
  }

  if (toolName === 'scope12.export') {
    if (!args?.run_id) return toolError('Missing run_id');
    const fmt = args?.format === 'csv' ? 'csv' : 'json';
    const result = runExport(args.run_id, fmt);
    if (result.error) return toolError(result.message);
    return toolJSON(result);
  }

  if (toolName === 'scope12.db.get') {
    if (!args?.collection) return toolError('Missing collection');
    const doc = store.get(args.collection, args.query || {});
    return toolJSON({ found: doc !== null, doc });
  }

  if (toolName === 'scope12.db.set') {
    if (!args?.collection) return toolError('Missing collection');
    if (!args?.doc || typeof args.doc !== 'object') return toolError('Missing doc object');
    const doc = store.set(args.collection, args.doc);
    return toolJSON({ ok: true, doc });
  }

  if (toolName === 'scope12.db.list') {
    if (!args?.collection) return toolError('Missing collection');
    const docs = store.list(args.collection, args.query || {}, args.limit);
    return toolJSON({ collection: args.collection, count: docs.length, docs });
  }

  if (toolName === 'scope12.db.delete') {
    if (!args?.collection) return toolError('Missing collection');
    if (!args?.query || typeof args.query !== 'object' || Object.keys(args.query).length === 0) {
      return toolError('query must be a non-empty object to prevent accidental wipe');
    }
    const result = store.delete(args.collection, args.query);
    return toolJSON(result);
  }

  if (toolName === 'scope12.db.bulkSet') {
    if (!args?.collection) return toolError('Missing collection');
    if (!Array.isArray(args?.docs)) return toolError('docs must be an array');
    const results = store.bulkSet(args.collection, args.docs);
    return toolJSON({ count: results.length, docs: results });
  }

  if (toolName === 'scope12.sha256') {
    if (!args?.text && args?.text !== '') return toolError('Missing text parameter');
    if (typeof args.text !== 'string') return toolError('text must be a string');
    return { content: [{ type: 'text', text: sha256Hex(args.text) }], isError: false };
  }

  if (toolName === 'scope12.scope1.calculate') {
    const result = scope1Calculate(args || {});
    return toolJSON(result);
  }

  if (toolName === 'scope12.scope2.calculate') {
    const result = scope2Calculate(args || {});
    return toolJSON(result);
  }

  if (toolName === 'scope12.kpi.normalize') {
    const result = kpiNormalize(args || {});
    return toolJSON(result);
  }

  if (toolName === 'scope12.report.export') {
    const result = reportExport(args || {});
    if (typeof result === 'string') {
      return { content: [{ type: 'text', text: result }], isError: false };
    }
    return toolJSON(result);
  }

  if (toolName === 'scope12.period.close') {
    const result = periodClose(args || {});
    if (result.error) return toolError(JSON.stringify(result));
    return toolJSON(result);
  }

  if (toolName === 'scope12.dq.score') {
    const result = dqScore(args || {});
    if (result.error) return toolError(result.message);
    return toolJSON(result);
  }

  if (toolName === 'scope12.evidence.validate') {
    const result = evidenceValidate(args || {});
    return toolJSON(result);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
async function handleMessage(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    const id = msg && Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
    return jsonRpcError(id, -32600, 'Invalid Request');
  }

  if (!Object.prototype.hasOwnProperty.call(msg, 'id')) return null; // notification
  const id = msg.id;
  const method = msg.method;

  try {
    if (method === 'ping') {
      return jsonRpcResult(id, {});
    }

    if (method === 'initialize') {
      const requested = msg.params?.protocolVersion;
      const protocolVersion = typeof requested === 'string' ? requested : '2024-11-05';
      return jsonRpcResult(id, {
        protocolVersion,
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        capabilities: { tools: { listChanged: false } },
        instructions: 'Scope 1/2 Accounting MCP server. Computes direct emissions (stationary, mobile, process, fugitive with GWP), purchased energy dual-ledger (location-based + market-based), KPI normalization, and reporting export.',
      });
    }

    if (method === 'tools/list') {
      return jsonRpcResult(id, { tools: getTools(), nextCursor: null });
    }

    if (method === 'tools/call') {
      const toolName = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      if (typeof toolName !== 'string') {
        return jsonRpcError(id, -32602, 'Invalid params: missing tool name');
      }
      const result = await callTool(toolName, args);
      if (result === null) {
        return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
      }
      return jsonRpcResult(id, result);
    }

    return jsonRpcError(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    return jsonRpcError(id, -32603, 'Internal error', { message: e?.message || String(e) });
  }
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
    } catch (_e) {
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
  const port = process.env.CARBONKIT_MCP_PORT || process.env.CARBONKIT_SCOPE12_PORT || 8404;
  startHttpTransport(handleMessage, null, port, { serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } });
} else {
  // Serialize request handling to avoid interleaved stdout frames.
  let _queue = Promise.resolve();
  enqueueMessage = function enqueueMessage(msg) {
    _queue = _queue.then(async () => {
      const resp = await handleMessage(msg);
      if (resp) sendFrame(resp);
    }).catch((err) => {
      const id = Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : null;
      sendFrame(jsonRpcError(id, -32603, err?.message || 'Internal error'));
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
