# CarbonKit Build Specification

> Single-source-of-truth for the self-hosted swarm research platform.
> Covers: audit findings, gap analysis, 8 workstreams, swarm team composition, file manifest, and verification plan.
> Updated: 2026-02-07

---

## Table of Contents

1. [Project State Audit](#1-project-state-audit)
2. [Gap Analysis: What the Plan Was Missing](#2-gap-analysis)
3. [Workstream 1: Unified Database Layer](#3-workstream-1-unified-database-layer)
4. [Workstream 2: Complete Stubbed MCP Tools](#4-workstream-2-complete-stubbed-mcp-tools)
5. [Workstream 3: Scope 1/2 MCP Server](#5-workstream-3-scope-12-mcp-server)
6. [Workstream 4: Swarm Orchestration System](#6-workstream-4-swarm-orchestration-system)
7. [Workstream 5: Self-Hosting Infrastructure](#7-workstream-5-self-hosting-infrastructure)
8. [Workstream 6: Testing & CI](#8-workstream-6-testing--ci)
9. [Workstream 7: Connectors & Schema Mapping](#9-workstream-7-connectors--schema-mapping)
10. [Workstream 8: Seed Data & Reference Bundles](#10-workstream-8-seed-data--reference-bundles)
11. [ERP/CRM/SaaS Schema Mapping Research](#11-erp-crm-saas-schema-mapping-research)
12. [Swarm Team Build Strategy](#12-swarm-team-build-strategy)
13. [Complete File Manifest](#13-complete-file-manifest)
14. [Verification Plan](#14-verification-plan)
15. [Testing Swarms](#15-testing-swarms)
- [Appendix E: Plugin Registry](#appendix-e-plugin-registry)
- [Appendix F: Environment Variables & Connector Auth](#appendix-f-environment-variables--connector-auth)

---

## 1. Project State Audit

### 1.1 What Exists Today

```
plugins/
  scope3-strategy/     v0.5.1  7 agents  14 commands  7 skills   strategy-mcp.js (17 tools)
  scope3-calculation/  v0.4.1  7 agents  17 commands  13 skills  calc-mcp.js (11 tools)
  scope3-execution/    v0.4.1  6 agents  19 commands  9 skills   exec-mcp.js (21 tools)
  scope12-accounting/  v0.1.1  5 agents   5 commands  4 skills   NO MCP SERVER
  quality-monitoring/  v0.1.0  1 agent    4 commands  1 skill    NO MCP SERVER
  ai-engineering/      v0.1.0  1 agent    3 commands  40+ skills NO MCP SERVER
  growth-content/      v0.1.0  1 agent    3 commands  11 skills  NO MCP SERVER
  sales-outreach/      v0.1.0  1 agent    3 commands  1 skill    retell/hunter-io MCP
  shared-services/     v0.2.0  0 agents   0 commands  0 skills   sequential-thinking MCP
```

**Totals**: 9 plugins, 29 agents, 68 commands, ~90 skills, 3 domain MCP servers (49 tools), 4 teams.

### 1.2 MCP Server Tool Status

#### calc-mcp.js (11 tools, 1024 lines)

| Tool | Status | Notes |
|------|--------|-------|
| `calc.health` | DONE | Plugin info + timestamp |
| `calc.sha256` | DONE | SHA-256 hex digest |
| `calc.db.get` | DONE | Collection query with filter/limit |
| `calc.db.set` | DONE | Upsert by `_id` |
| `calc.db.delete` | DONE | Delete by query, has empty-query guard |
| `calc.db.list` | DONE | Alias for get |
| `calc.compute` | DONE | Full method hierarchy engine (lines 250-459): supplier_primary > average_quantity > spend > none. Groups by vendor\|item_description. FX normalization. Writes inventory_items, versions, lca_runs, lca_run_history. Closed-period check with force override. |
| `calc.fx_normalize` | DONE | Cross-rate via USD pivot. 20 hardcoded pairs (lines 124-144). Custom override from fx_rates collection. |
| `calc.dqs_score` | DONE | Formula: `final_dqs = clamp(0.7 * base + 0.3 * method, 0, 1)`. Weights: vendor=0.25, description=0.25, spend=0.30, currency=0.10, quantity=0.05, unit=0.05. Method scores: primary=1.0, quantity=0.8, spend=0.6, none=0.3. |
| `calc.ingest` | DONE | Flag detection (MISSING_VENDOR, MISSING_DESCRIPTION, etc.), reconciliation summary, creates job with status DONE immediately. |
| `calc.export` | DONE | CSV and JSON export. CSV quoting only handles commas (not quotes/newlines). |

**FileStore** (lines 38-118): Inline. `get()` returns array. Timestamps: `_created_at`/`_updated_at`. ID: `crypto.randomUUID()`. No audit log. No path sanitization.

#### exec-mcp.js (21 tools, 1082 lines)

| Tool | Status | Notes |
|------|--------|-------|
| `exec.health` | DONE | |
| `exec.sha256` | DONE | |
| `exec.db.get` | DONE | |
| `exec.db.set` | DONE | |
| `exec.db.delete` | DONE | Has empty-query guard |
| `exec.db.list` | DONE | |
| `exec.pipeline.run` | SIMULATED | 5 stages (seed/sources/ingest/seed_data/generate) all complete instantly. Counts records, flips flags. No real processing. |
| `exec.pipeline.stage` | SIMULATED | Single-stage variant of above. |
| `exec.render_page` | **STUB** | Returns hardcoded 612x792 (US Letter @ 72 DPI). "Simulated render -- no actual image produced." (line 768) |
| `exec.ocr` | **STUB** | Returns 5 fake blocks. Random confidence (0.85 + Math.random() * 0.14). Placeholder text: "[simulated OCR block N for ...]" |
| `exec.upload_pdf` | PARTIAL | Registers metadata only. **No binary file storage.** render_page/ocr operate on phantom documents. |
| `exec.engagement.update` | DONE | Upsert with status validation |
| `exec.engagement.list` | DONE | |
| `exec.suppliers.list` | DONE | Supports category/rating/min_impact filtering |
| `exec.suppliers.heatmap` | DONE | Category x rating pivot |
| `exec.provenance.save` | DONE | Full validation incl. OCR block cross-reference, computes min confidence |
| `exec.provenance.list` | DONE | |
| `exec.provenance.delete` | DONE | |
| `exec.maturity_score` | DONE | M0(0) / M1(25) / M2(50) / M3(75) / M4(100). Based on evidence_status + provenance count + engagement status. |
| `exec.quality_gates` | DONE | 5 deterministic gates: pipeline_stages_complete, suppliers_exist, emission_factors_loaded, no_orphan_provenance, documents_ingested |
| `exec.export` | DONE | 4 formats: CSRD (ESRS-structured), GHG (scoped), PDF (**JSON manifest, not actual PDF**), JSON (raw) |

**FileStore** (lines 53-132): Inline. `get()` returns single/null. Timestamps: `_created`/`_updated`. ID: `crypto.randomUUID()`. No audit log. Has path sanitization.

#### strategy-mcp.js (17 tools, 1193 lines)

| Tool | Status | Notes |
|------|--------|-------|
| `strategy.health` | DONE | |
| `strategy.sha256` | DONE | |
| `strategy.db.get` | DONE | |
| `strategy.db.set` | DONE | |
| `strategy.db.delete` | **BUG** | No empty-query guard. Can wipe entire collections. |
| `strategy.db.list` | DONE | |
| `strategy.assessment.create` | DONE | Duplicate check, draft status |
| `strategy.assessment.get` | DONE | |
| `strategy.iro.list` | DONE | Validates assessment exists |
| `strategy.iro.create` | DONE | Validates type (impact/risk/opportunity), finalization guard |
| `strategy.iro.score` | DONE | impact_materiality (1-5), financial_materiality (1-5), optional likelihood/confidence |
| `strategy.evidence.add` | DONE | Dedup via source SHA-256. Increments evidence_count. Finalization guard. |
| `strategy.materiality_matrix` | DONE | 4-quadrant (material/impact_only/financial_only/not_material), threshold=3 hardcoded |
| `strategy.esrs_sequence` | DONE | Groups by ESRS topic (E1-E5, S1-S4, G1). Ranks material-first. |
| `strategy.snapshot` | DONE | SHA-256 content-addressed. Finalization gate: all IROs must have evidence. Irreversible. |
| `strategy.risk_scan` | **SIMULATED** | 6 hardcoded signals (lines 817-890). Priority formula: 0.3*severity + 0.25*relevance + 0.2*credibility + 0.15*novelty + 0.1*actionability. Keyword filtering is substring match. Always returns >= 3 results. |
| `strategy.export` | DONE | json (full dump + SHA-256) and evidence_pack (organized by IRO) |

**FileStore** (lines 37-113): Inline. `get()` returns single/null. Timestamps: `created_at`/`updated_at`. ID: `crypto.randomUUID()`. No audit log. Has path sanitization.

### 1.3 Shared Services

**db-adapter.js** (158 lines): Standalone FileStore with `_appendAudit()` writing to `_audit_log.json` with SHA-256 content hashes. **Not used by any MCP server.** API differences from inline implementations:

| Feature | db-adapter.js | calc-mcp | exec-mcp | strategy-mcp |
|---------|--------------|----------|----------|--------------|
| Audit log | Yes | No | No | No |
| `get()` returns | single/null | **array** | single/null | single/null |
| Timestamp fields | (none) | `_created_at`/`_updated_at` | `_created`/`_updated` | `created_at`/`updated_at` |
| `delete()` returns | count | `{ removed }` | count | `{ removed }` |
| ID generation | `randomBytes(12).hex` | `randomUUID` | `randomUUID` | `randomUUID` |
| Empty query guard | No | Yes (delete) | Yes (delete) | **No** |

**carbonkit-cli.js** (499 lines): 5 commands (init, run, validate, export, list). **Critical bug**: `run` sends bare JSON without `Content-Length` header, so MCP framing is broken.

### 1.4 Data Directories

All three data directories (`scope3-calculation/data/`, `scope3-execution/data/`, `scope3-strategy/data/`) are **empty**. No seed emission factors, suppliers, assessments, or reference data ships with the project.

### 1.5 Dual Command Interface Pattern

Each plugin has TWO command sets:

1. **MCP-tool commands** (e.g., `carbon-calc-jobs.md`) -- reference `calc.*` / `exec.*` / `strategy.*` tools
2. **REST-API commands** (e.g., `client-server-ingest-flow.md`) -- reference endpoints like `/api/dma/*`, `/api/lca/*`, `/api/pipeline/*`

The REST API backend **does not exist**. These commands describe a hypothetical Flask/FastAPI server. The MCP-tool commands are the functional interface.

### 1.6 Tool Naming Inconsistency

- scope3-calculation commands: bare names (`calc.health`, `calc.db.get`)
- scope3-execution commands: full prefix (`mcp__exec-local__exec.health`)
- scope3-strategy commands: full prefix (`mcp__strategy-local__strategy.health`)

### 1.7 Cross-Plugin Isolation

The 3 MCP servers are completely isolated. No agent/command in one plugin references tools from another. The `esg-scope3` team chains them at the team level (strategy -> calculation -> execution) but there is no data-level bridge.

### 1.8 Hooks

README claims scope3 plugins have `hooks.json`. **Zero hooks.json files exist anywhere.**

### 1.9 Teams

```json
{
  "esg-scope3":  ["scope3-strategy", "scope3-calculation", "scope3-execution", "quality-monitoring"],
  "esg-scope12": ["scope12-accounting", "quality-monitoring"],
  "revops":      ["sales-outreach", "quality-monitoring"],
  "growth":      ["growth-content", "ai-engineering", "quality-monitoring"]
}
```

### 1.10 Scope12 Accounting — Documentation Richness

The scope12-accounting plugin has **zero runtime code** but the most detailed formula documentation:

**Scope 1 formulas documented**: Stationary combustion, mobile combustion, process emissions, fugitive emissions (F-gases + refrigerants). Gas-level GWP application (CO2, CH4, N2O + F-gases). Biogenic CO2 tracked separately. Factor hierarchy (4 tiers). Activity hierarchy (4 tiers). DQ scoring (5 dimensions). 4+ hard gates.

**Scope 2 formulas documented**: Dual ledger (location-based + market-based). Unit normalization (MWh/GJ/MMBtu -> kWh). Market-based hierarchy: contractual > residual mix > fallback+exception > FAIL. Evidence schema (16+ required fields, ownership_status == 'owned_and_retired'). On-site generation rules. Net import calculation.

**KPI formulas documented**: 5 intensity KPIs (tCO2e/mUSD, kgCO2e/unit, tCO2e/FTE, kgCO2e/m2, tCO2e/MWh). Constant-currency normalization. Deflator normalization. Base-year indexing. 5 rebasing triggers. Coverage ratio gate.

**Report pack rules documented**: Tie-out identities. MB coverage disclosure table. Claim quality grading (HIGH/MEDIUM/LOW/NO_CLAIM). Period close with restatement metadata (15 required fields). Immutable evidence binding.

---

## 2. Gap Analysis

### What the Original Plan Was Missing

| # | Gap | Severity | Resolution |
|---|-----|----------|------------|
| G1 | **carbonkit-cli.js MCP framing bug** -- `run` sends bare JSON, no `Content-Length` header | Critical | Fix in Workstream 1 |
| G2 | **No binary file/blob storage** -- `exec.upload_pdf` stores metadata only. render_page and ocr operate on phantom documents. | Critical | Add blob store to Workstream 1 |
| G3 | **Factor matching is primitive** -- `resolveMethod` only filters by `basis` field. No match by category, vendor, geography, unit. | High | Extend in Workstream 2 |
| G4 | **All 3 data directories empty** -- No seed emission factors, no suppliers, no reference data. Platform unusable out of box. | High | New Workstream 8 |
| G5 | **Pipeline stages all simulated** -- exec-mcp's 5-stage pipeline is fake. Plan only mentions render_page/ocr stubs. | High | Expand Workstream 2 |
| G6 | **REST-API commands reference non-existent backend** -- Half the commands call `/api/dma/*`, `/api/lca/*` etc. No Flask/FastAPI server exists. | Medium | Deprecate REST commands, consolidate to MCP interface |
| G7 | **strategy.db.delete has no empty-query guard** -- Can accidentally wipe collections. | Medium | Fix in Workstream 1 |
| G8 | **Tool naming inconsistency** -- calc uses bare names, exec/strategy use `mcp__*__` prefix. | Medium | Normalize in Workstream 2 |
| G9 | **No cross-plugin data bridge** -- 3 MCP servers are isolated. No supplier → activity_rows flow, no assessment → engagement flow. | Medium | Add cross-plugin views in Workstream 1 (unified DB makes this possible) |
| G10 | **Export PDF is a JSON manifest** -- exec.export PDF format doesn't produce actual PDF. | Medium | Add real PDF generation in Workstream 2 |
| G11 | **Rate limits documented but not enforced** -- exec-orchestrator specifies rate limits (OCR 12/min) but exec-mcp has no throttling. | Medium | Add to Workstream 2 |
| G12 | **quality-monitoring has no runtime** -- Referenced by all 4 teams but has no MCP server or executable code. | Medium | Add minimal quality MCP in Workstream 2 |
| G13 | **No observability** -- No structured logging, metrics, or tracing. Critical for self-hosted research platform. | Medium | Add to Workstream 5 |
| G14 | **No bulkSet in MCP tools** -- Needed for seeding emission factors (thousands of records). store-adapter has it, but no tool exposes it. | Low | Add bulk tools in Workstream 2 |
| G15 | **CSV export doesn't handle embedded quotes/newlines** -- calc.export line 589 only quotes commas. | Low | Fix in Workstream 2 |
| G16 | **hooks.json files don't exist** -- README claims they do. | Low | Remove from README or create them |
| G17 | **No backup/restore strategy** -- SQLite WAL is good for concurrency but plan has no backup mention. | Low | Add to Workstream 5 |
| G18 | **Materiality threshold hardcoded at 3** -- Not configurable. | Low | Parameterize in Workstream 2 |
| G19 | **Evidence dedup too aggressive** -- SHA-256 of source URL only. Different evidence from same source (different pages) rejected. | Low | Fix dedup key in Workstream 2 |
| G20 | **Snapshot finalization irreversible with no admin override** | Low | Add admin force-unfinalize in Workstream 2 |
| G21 | **No error recovery in compute engine** -- If calc.compute fails mid-way, no partial progress saved. | Low | Add checkpoint in Workstream 2 |
| G22 | **Ingest creates job as DONE instantly** -- No PENDING/PROCESSING state. | Low | Add status lifecycle in Workstream 2 |

---

## 3. Workstream 1: Unified Database Layer

**Goal**: Replace 3 divergent inline FileStore implementations with a single adapter supporting File (backward-compat), SQLite (default), and Postgres (scale-up). Add blob storage for PDF/image files.

### Files to Create

| File | Purpose |
|------|---------|
| `shared-services/tools/store-adapter.js` | Factory: `createStore({ backend, dbPath, pgUrl })` returning unified interface |
| `shared-services/tools/backends/file-store.js` | Extracted + normalized FileStore (from db-adapter.js + audit logging) |
| `shared-services/tools/backends/sqlite-store.js` | SQLite via better-sqlite3 (WAL mode, JSON1 indexes) |
| `shared-services/tools/backends/postgres-store.js` | Postgres via pg (jsonb, GIN indexes, connection pool) |
| `shared-services/tools/backends/blob-store.js` | Binary file storage: local FS (default) or S3-compatible |
| `shared-services/tools/migrate-filestore.js` | `--from file --to sqlite` migration with timestamp normalization |

### Unified Store Interface

```javascript
// createStore({ backend: 'sqlite', dbPath: '~/.carbonkit/data/carbonkit.db' })
{
  get(collection, query)          // Returns single doc or null
  list(collection, query, limit)  // Returns array
  set(collection, doc)            // Upsert by _id, returns doc
  delete(collection, query)       // Returns { removed: N }. Rejects empty query.
  bulkSet(collection, docs)       // Batch upsert, returns { inserted, updated }
  count(collection, query)        // Returns integer
  close()                         // Cleanup

  // Cross-plugin views (new)
  view(viewName, params)          // Pre-defined cross-collection queries

  // Metadata
  _generateId()                   // crypto.randomUUID()
  _audit(collection, op, hash)    // Append to audit log
}
```

### Blob Store Interface

```javascript
// createBlobStore({ backend: 'fs', basePath: '~/.carbonkit/blobs' })
{
  put(key, buffer, metadata)      // Store binary, returns { key, size, sha256 }
  get(key)                        // Returns { buffer, metadata }
  exists(key)                     // Returns boolean
  delete(key)                     // Returns boolean
  list(prefix)                    // Returns keys matching prefix
}
```

### Key Design Decisions

- SQLite as zero-config default (`~/.carbonkit/data/carbonkit.db`), WAL mode
- One table per collection: `_id TEXT PRIMARY KEY, doc JSON, _created_at TEXT, _updated_at TEXT`
- JSON1 indexes: `CREATE INDEX idx_{coll}_job_id ON {coll}(json_extract(doc, '$.job_id'))`
- Blob storage: local filesystem default (`~/.carbonkit/blobs/{sha256_prefix}/{sha256}`), content-addressed
- Timestamp normalization: all servers use `_created_at` / `_updated_at` (ISO 8601 UTC)
- Audit log: every write appends to `_audit_log` table/collection with `{ timestamp, collection, operation, doc_id, sha256 }`
- Empty-query guard on delete across all backends (fixes G7)
- Env: `CARBONKIT_DB_BACKEND=sqlite|file` (postgres planned, not yet supported), `CARBONKIT_BLOB_BACKEND=fs|s3`

### Files to Modify

| File | Change |
|------|--------|
| `scope3-calculation/tools/calc-mcp.js` | Delete inline FileStore (lines 38-118). Import store-adapter. Normalize `get()` to return single/null (was array). Normalize timestamps to `_created_at`/`_updated_at`. |
| `scope3-execution/tools/exec-mcp.js` | Delete inline FileStore (lines 53-132). Import store-adapter. Normalize timestamps from `_created`/`_updated` to `_created_at`/`_updated_at`. |
| `scope3-strategy/tools/strategy-mcp.js` | Delete inline FileStore (lines 37-113). Import store-adapter. Normalize timestamps from `created_at`/`updated_at` to `_created_at`/`_updated_at`. Add empty-query guard to delete. |
| `shared-services/tools/carbonkit-cli.js` | Fix MCP framing in `run` command: add `Content-Length` header (fixes G1). |
| `plugins/package.json` | Add `better-sqlite3`, `pg` (optional) dependencies. |

### Cross-Plugin Views (New — Fixes G9)

With a unified database, define pre-built views:

```javascript
// View: supplier_emissions — joins exec.suppliers with calc.inventory_items
view('supplier_emissions', { supplier_id })
// Returns: { supplier, total_tco2e, method_breakdown, dqs }

// View: assessment_coverage — joins strategy.iros with exec.provenance
view('assessment_coverage', { assessment_id })
// Returns: { iro, evidence_count, provenance_count, maturity_level }

// View: org_footprint — aggregates all scopes
view('org_footprint', { year })
// Returns: { scope1, scope2_lb, scope2_mb, scope3_by_category, total }
```

---

## 4. Workstream 2: Complete Stubbed MCP Tools

### exec-mcp.js Fixes

#### exec.render_page (Currently: hardcoded 612x792 stub, lines 748-769)

**Implementation**: `pdfjs-dist` + `@napi-rs/canvas` for pure-JS rendering. Falls back to system `pdftoppm` if available.

```
Input:  { doc_id, page_number, zoom: 1.0 }
Flow:   1. Look up document metadata in store
        2. Read PDF binary from blob store (NEW — requires blob store from WS1)
        3. Render page via pdfjs-dist to canvas
        4. Save rendered image to blob store
        5. Persist render record with { width, height, blob_key }
Output: { render_id, width, height, blob_key }
```

#### exec.ocr (Currently: 5 fake blocks, lines 771-796)

**Implementation**: `tesseract.js` (WASM, no system install). Falls back to system `tesseract` binary.

```
Input:  { doc_id, page_number }
Flow:   1. Look up render for this doc/page (must exist)
        2. Read rendered image from blob store
        3. Run tesseract.js with eng language
        4. Extract blocks with bbox, confidence, text
        5. Persist blocks to ocr_blocks collection
Output: { block_count, blocks: [{ block_id, text, confidence, bbox }] }
```

#### exec.upload_pdf (Currently: metadata only)

**Fix**: Accept binary content (base64 or file path), store in blob store, persist metadata with `blob_key`.

```
Input:  { filename, content_base64 OR file_path, category, company_id? }
Flow:   1. Decode/read binary
        2. Store in blob store → blob_key, sha256
        3. Persist document record with blob_key
Output: { doc_id, blob_key, sha256, page_count }
```

#### exec.pipeline stages (Currently: all simulated)

**Fix**: Make stages real:

| Stage | Current | Real Implementation |
|-------|---------|-------------------|
| `seed` | Counts emission_factors | Seed from bundled reference data if empty |
| `sources` | Counts documents | Validate all documents have blob_keys, report missing binaries |
| `ingest` | Flips ingested flag | Run render_page + ocr on un-ingested documents |
| `seed_data` | Counts benchmarks | Extract structured data from OCR blocks using pattern matching |
| `generate` | Flips recommendations flag | Generate recommendations based on maturity scores and benchmarks |

#### exec.export PDF (Currently: JSON manifest)

**Fix**: Use `pdfkit` or `@react-pdf/renderer` to produce actual PDF. Falls back to JSON manifest if PDF generation unavailable.

### strategy-mcp.js Fixes

#### strategy.risk_scan (Currently: 6 hardcoded signals, lines 809-958)

**Implementation**: Scan local document corpus + bundled baseline signals.

```
Flow:   1. Load risk-intelligence-baseline.json (~100 curated ESG signals)
        2. Scan all documents in store (OCR text from exec plugin via unified DB)
        3. Keyword match + TF-IDF relevance scoring against signal definitions
        4. Apply priority formula: 0.3*sev + 0.25*rel + 0.2*cred + 0.15*nov + 0.1*act
        5. Classify: high (>=7), medium (>=5), low (<5)
        6. Merge bundled + corpus-discovered signals
        7. Persist scan record
```

#### strategy.snapshot.verify (Currently: not implemented)

```
Input:  { snapshot_id }
Flow:   1. Load snapshot from store
        2. Recompute SHA-256 from current IRO + evidence state
        3. Compare against stored hash
        4. Report: match/drift with details
Output: { verified: bool, stored_hash, computed_hash, drift_details? }
```

### Cross-Cutting Fixes

#### Factor Matching Enhancement (Fixes G3)

Current `resolveMethod()` (calc-mcp lines 250-308) only filters by `basis`. Extend to:

```javascript
function findBestFactor(item, factors) {
  // Priority: exact match → category match → fallback
  const candidates = factors.filter(f => f.basis === targetBasis);

  // 1. Exact: matches vendor + category + unit + geography
  let match = candidates.find(f =>
    f.vendor === item.vendor &&
    f.category === item.category &&
    f.unit === item.unit
  );
  if (match) return { factor: match, match_quality: 'exact' };

  // 2. Category: matches category + unit
  match = candidates.find(f =>
    f.category === item.category &&
    f.unit === item.unit
  );
  if (match) return { factor: match, match_quality: 'category' };

  // 3. Category-only: matches category
  match = candidates.find(f => f.category === item.category);
  if (match) return { factor: match, match_quality: 'category_broad' };

  // 4. Fallback: first available factor for basis
  if (candidates.length > 0) return { factor: candidates[0], match_quality: 'fallback' };

  return { factor: null, match_quality: 'none' };
}
```

#### CSV Export Fix (Fixes G15)

Replace line 589 quoting logic with RFC 4180 compliant:

```javascript
function csvEscape(val) {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
```

#### Bulk Operations (Fixes G14)

Add `calc.db.bulkSet`, `exec.db.bulkSet`, `strategy.db.bulkSet` tools — delegate to `store.bulkSet()`.

#### Rate Limiting (Fixes G11)

Add to exec-mcp.js:

```javascript
const RATE_LIMITS = {
  'exec.ocr': { max: 12, windowMs: 60000 },
  'exec.render_page': { max: 12, windowMs: 60000 },
  'exec.upload_pdf': { max: 6, windowMs: 60000 },
};
```

Token bucket per tool, checked before execution.

#### Job Status Lifecycle (Fixes G22)

```
PENDING → PROCESSING → DONE | FAILED
```

Ingest creates job as PENDING. Background processing (flag detection, reconciliation) transitions to PROCESSING then DONE.

#### Tool Naming Normalization (Fixes G8)

Update all scope3-calculation command files to use `mcp__calc-local__calc.*` prefix, matching exec/strategy convention. 6 command files affected.

#### Evidence Dedup Fix (Fixes G19)

Change dedup key from `sha256(source)` to `sha256(source + iro_id + description_first_100_chars)`.

#### Configurable Materiality Threshold (Fixes G18)

Add optional `threshold` parameter to `strategy.materiality_matrix` (default 3).

#### Compute Checkpoint (Fixes G21)

Write partial `inventory_items` every 100 groups during `calc.compute`. On failure, resume from last checkpoint.

### New Files

| File | Purpose |
|------|---------|
| `scope3-strategy/data/risk-intelligence-baseline.json` | ~100 curated ESG risk signals (CSRD/SEC/ISSB/CDP) |
| `shared-services/tools/validate.js` | `requireString()`, `requireNumber()`, `validateCurrencyCode()`, `validateISO8601()`, etc. |
| `shared-services/tools/mcp-helpers.js` | `toolSuccess(data)`, `toolFailure(code, message)` with standard error codes |

---

## 5. Workstream 3: Scope 1/2 MCP Server

**Goal**: Build runtime for scope12-accounting. The plugin has 5 agents and detailed formula specs but zero code.

### New File: `scope12-accounting/tools/scope12-mcp.js`

**Tools** (14):

| Tool | Description |
|------|-------------|
| `scope12.health` | Server info |
| `scope12.db.get` | Collection query |
| `scope12.db.set` | Upsert |
| `scope12.db.delete` | Delete with guard |
| `scope12.db.list` | List with filter |
| `scope12.db.bulkSet` | Batch upsert (for seeding factors) |
| `scope12.scope1.calculate` | Scope 1 engine: 4 source types, gas-level GWP, biogenic separation |
| `scope12.scope2.calculate` | Scope 2 dual-ledger: location-based + market-based |
| `scope12.kpi.normalize` | 5 intensity KPIs with coverage ratio gate |
| `scope12.report.export` | Report pack with tie-outs and MB coverage table |
| `scope12.period.close` | Period close with restatement governance |
| `scope12.dq.score` | Data quality scoring (5 dimensions) |
| `scope12.evidence.validate` | Market-based evidence schema validation (16+ fields) |
| `scope12.sha256` | Hash utility |

### Scope 1 Engine (from `skills/scope1-method-rules/SKILL.md`)

```
Source Types:
  1. Stationary combustion: E = Σ(fuel_consumed × EF × GWP_gas) per gas
  2. Mobile combustion: E = Σ(fuel_consumed × EF × GWP_gas) per gas
  3. Process emissions: E = Σ(activity_data × process_EF × GWP_gas)
  4. Fugitive emissions: E = Σ(charge × (1-recovery) × GWP_gas) for F-gases/refrigerants

GWP Application:
  CO2e = CO2 × GWP_CO2 + CH4 × GWP_CH4 + N2O × GWP_N2O + Σ(F-gas × GWP_F-gas)
  Biogenic CO2: tracked in separate column, NOT in Scope 1 total

Hard Gates:
  - Unknown unit → FAIL (no silent conversion)
  - Missing GWP for declared gas → FAIL
  - Proxy data without documented exception → FAIL
  - DQ score > 3.0 without signed waiver → FAIL

Factor Hierarchy (4 tiers):
  1. Measured: direct CEMS/flowmeter data
  2. Calculated: stoichiometric from fuel analysis
  3. Published: EPA AP-42 / IPCC defaults
  4. Estimated: engineering estimate with uncertainty range

Activity Hierarchy (4 tiers):
  1. Continuous metering
  2. Periodic sampling + extrapolation
  3. Fuel purchase records
  4. Proxy/modeled
```

### Scope 2 Engine (from `skills/scope2-method-rules/SKILL.md`)

```
Dual Ledger:
  Location-Based: E_LB = Σ(kWh_consumed × grid_average_factor)
  Market-Based:   E_MB = Σ(kWh_consumed × contractual_factor)

Unit Normalization:
  1 MWh = 1000 kWh
  1 GJ = 277.778 kWh
  1 MMBtu = 293.071 kWh

Market-Based Hierarchy:
  1. Contractual instruments (EACs, PPAs, RECs) → use supplier-specific factor
     Gate: ownership_status MUST be 'owned_and_retired'
  2. Residual mix factor → use grid residual after certificates removed
  3. Fallback + exception → use grid average + document exception
  4. FAIL → block reporting, escalate

Evidence Schema (16+ required fields):
  certificate_id, issuer, generation_source, generation_period_start,
  generation_period_end, generation_mwh, technology, location, grid_region,
  retirement_date, retirement_registry, ownership_status, beneficiary,
  vintage_year, tracking_system, verification_standard

On-Site Generation:
  If on-site solar/wind: net_import = grid_consumption - on_site_generation
  Only net_import uses grid factor; on-site generation uses zero or PPA factor
```

### KPI Normalization (from `skills/kpi-normalization-rules/SKILL.md`)

```
5 KPIs:
  1. tCO2e / M$ revenue (carbon intensity by revenue)
  2. kgCO2e / unit produced (carbon intensity by output)
  3. tCO2e / FTE (carbon intensity by headcount)
  4. kgCO2e / m² (carbon intensity by floor area)
  5. tCO2e / MWh (energy carbon intensity)

Coverage Ratio Gate:
  coverage = measured_emissions / total_estimated_emissions
  If coverage < 0.80 → WARN
  If coverage < 0.50 → FAIL

Revenue Normalization:
  constant_currency_revenue = nominal_revenue × (base_year_fx / current_fx)
  deflator_adjusted_revenue = nominal_revenue / CPI_deflator

Base-Year Indexing:
  index = current_year_intensity / base_year_intensity × 100

Rebasing Triggers (5):
  1. Structural change (M&A, divestiture)
  2. Methodology change (new EF source)
  3. Boundary change (new facility)
  4. Cumulative error > 5%
  5. Sector benchmark realignment
```

### Bundled Reference Data

| File | Content | Records |
|------|---------|---------|
| `scope12-accounting/data/gwp_ar5.json` | IPCC AR5 GWP-100 table | ~20 gases |
| `scope12-accounting/data/gwp_ar6.json` | IPCC AR6 GWP-100 table | ~20 gases |
| `scope12-accounting/data/grid_factors_2024.json` | eGRID subregion + IEA country factors | ~100 regions |
| `scope12-accounting/data/combustion_factors.json` | EPA AP-42 + IPCC stationary/mobile defaults | ~50 fuel types |

### Files to Modify

| File | Change |
|------|--------|
| `scope12-accounting/.mcp.json` | Add `scope12-local` MCP server entry |
| `scope12-accounting/.claude-plugin/plugin.json` | Add `mcpServers` reference |
| `plugins/package.json` | Dependencies already covered by WS1 |

---

## 6. Workstream 4: Swarm Orchestration System

### New Plugin: `plugins/swarms/`

```
swarms/
  .claude-plugin/plugin.json
  .mcp.json                          # swarm-mcp.js
  tools/swarm-mcp.js                 # Orchestration engine
  agents/
    swarm-conductor.md               # Top-level DAG executor
    stage-supervisor.md              # Per-stage monitor
    merge-operator.md                # Result aggregation
    recovery-operator.md             # Self-healing
  commands/
    run-swarm.md                     # /carbon:swarm:run
    list-swarms.md                   # /carbon:swarm:list
    status.md                        # /carbon:swarm:status
    replay.md                        # /carbon:swarm:replay
  skills/
    dag-resolution/SKILL.md
    agent-dispatch/SKILL.md
    result-merge/SKILL.md
    self-healing/SKILL.md
  workflows/                         # 8 pre-built templates
    rapid-baseline.yaml              # First-pass Scope 3 (~15min, 5 agents)
    full-scope3-audit.yaml           # Annual CSRD compliance (~45min, 14 agents)
    supplier-engagement-blitz.yaml   # Top-50 supplier outreach (~30min, 6 agents)
    csrd-disclosure-prep.yaml        # DMA + materiality + evidence pack (~35min, 8 agents)
    scope12-annual-close.yaml        # Year-end Scope 1+2 close (~20min, 5 agents)
    cross-scope-reconciliation.yaml  # Board-ready unified view (~40min, 8 agents)
    risk-intelligence-sweep.yaml     # Quarterly risk review (~20min, 5 agents)
    data-collection-sweep.yaml       # Parallel data pull from all sources (~25min, 8 agents)
  schema/
    swarm-v1.schema.json             # YAML validation schema
```

### Architecture

```
User → /carbon:swarm:run <workflow.yaml>
  → Swarm Conductor (reads YAML, resolves DAG)
    → Stage Supervisors (one per active stage)
      → Domain Agents (existing, unmodified)
        → MCP Tools (existing)
          → Store (SQLite/Postgres)
```

### Swarm YAML Schema (Key Concepts)

```yaml
swarm:
  name: rapid-baseline
  version: 1
  description: First-pass Scope 3 spend-based baseline

stages:
  - id: ingest
    depends_on: []
    agents:
      - agent: scope3-calculation/agents/spend-baseline-operator
        plugin: scope3-calculation
        task: "Ingest spend data and run reconciliation"
        tools: [calc.ingest, calc.db.set, calc.db.get]
        inputs: { file: "$input.spend_file" }
        outputs: { job_id: "$.job_id" }

  - id: compute
    depends_on: [ingest]
    agents:
      - agent: scope3-calculation/agents/calculation-orchestrator
        plugin: scope3-calculation
        task: "Run emissions computation with method hierarchy"
        tools: [calc.compute, calc.dqs_score, calc.fx_normalize]
        inputs: { job_id: "$stages.ingest.outputs.job_id" }
        outputs: { run_id: "$.run_id", total_tco2e: "$.total_emissions_tco2e" }

  - id: quality
    depends_on: [compute]
    gate: all_agents_succeed
    agents:
      - agent: scope3-calculation/agents/traceability-auditor
        plugin: scope3-calculation
        task: "Validate DQS and trace payloads"
        tools: [calc.dqs_score, calc.db.get]
      - agent: scope3-execution/agents/evidence-integrity-operator
        plugin: scope3-execution
        task: "Verify quality gates pass"
        tools: [exec.quality_gates]

  - id: export
    depends_on: [quality]
    merge: collect
    agents:
      - agent: scope3-calculation/agents/governance-controller
        plugin: scope3-calculation
        task: "Export baseline report"
        tools: [calc.export]

deliverable:
  title: "Rapid Scope 3 Baseline"
  assemble_from: [ingest, compute, quality, export]
  hash: sha256
  audit_trail: true
```

### Merge Strategies

| Strategy | Behavior |
|----------|----------|
| `collect` | Keyed map of all agent outputs |
| `reduce` | Apply reducer: `all_must_pass` / `majority_vote` / `weighted_score` |
| `chain` | Sequential within stage (output N → input N+1) |
| `vote` | Tallied recommendations with agreement threshold |

### Gate Types

| Gate | Behavior |
|------|----------|
| `all_agents_succeed` | Every agent must return success |
| `quorum` | Min N agents succeed + all required agents |
| `unanimous` | All agents must agree on a value |
| `custom` | User-defined gate function |

### Self-Healing

| Strategy | Behavior |
|----------|----------|
| `retry_with_fix` | Spawn fix agent to diagnose, then retry original |
| `reassign` | Route to a different agent |
| `escalate_to_user` | Pause and ask human |
| `skip_with_warning` | Log warning, continue pipeline |

### swarm-mcp.js Tools (12)

| Tool | Description |
|------|-------------|
| `swarm.validate` | Validate YAML against schema, check agent/tool references |
| `swarm.run` | Execute workflow from YAML. Returns run_id. |
| `swarm.status` | Get run status (stages completed, in-progress, pending) |
| `swarm.stage.result` | Get stage output by stage_id |
| `swarm.agent.spawn` | Spawn single agent with task/tools/inputs |
| `swarm.merge` | Apply merge strategy to stage results |
| `swarm.gate.check` | Evaluate gate condition |
| `swarm.recover` | Apply self-healing strategy |
| `swarm.deliverable` | Assemble final deliverable with SHA-256 |
| `swarm.replay` | Re-run completed workflow with same inputs |
| `swarm.list` | List available workflows and past runs |
| `swarm.db.*` | CRUD for swarm state (runs, stages, agent_results) |

### Integration

- Maps to Claude Code's `TeamCreate` / `Task` / `SendMessage` for actual agent dispatch
- Existing agents are never modified — swarm reads their `.md` frontmatter for context
- Add `esg-full-swarm` team to `teams.json` spanning all ESG plugins

---

## 7. Workstream 5: Self-Hosting Infrastructure

### Docker Compose

```
docker/
  Dockerfile.mcp-servers          # Single image for all 4 MCP servers
  Dockerfile.agent-runtime        # Agent loop runtime
  init-db.sql                     # Postgres schema (if pg backend)
docker-compose.yml                # SQLite default
docker-compose.postgres.yml       # Postgres overlay
docker-compose.ollama.yml         # Ollama GPU passthrough overlay
.env.example
Makefile
```

### MCP HTTP Transport (Fixes self-hosting requirement)

New: `shared-services/tools/mcp-http-transport.js` — wraps existing stdio handlers behind Node HTTP server.

Each MCP server gets 5-line addition:
```javascript
if (process.env.CARBONKIT_MCP_TRANSPORT === 'http') {
  const { startHttpTransport } = require('../../shared-services/tools/mcp-http-transport');
  startHttpTransport(server, parseInt(process.env.CARBONKIT_MCP_PORT || '8401'));
} else {
  // existing stdio transport
}
```

Ports: calc=8401, exec=8402, strategy=8403, scope12=8404, swarm=8405

### LLM Backend Abstraction

| File | Purpose |
|------|---------|
| `shared-services/tools/llm-router.js` | OpenAI-compatible proxy routing to configured backend |
| `shared-services/tools/agent-runtime.js` | Reads agent `.md`, connects MCP servers, runs agent loop |

Env: `CARBONKIT_LLM_BACKEND=anthropic|ollama|vllm|llamacpp`, `CARBONKIT_LLM_URL`, `CARBONKIT_LLM_MODEL`

### Observability (Fixes G13)

| File | Purpose |
|------|---------|
| `shared-services/tools/logger.js` | Structured JSON logging (pino). Levels: debug/info/warn/error. |
| `shared-services/tools/metrics.js` | Prometheus-compatible metrics: tool_calls_total, tool_duration_seconds, store_operations_total, active_swarm_runs |

All MCP servers import logger and wrap tool handlers with timing/counting.

### Backup (Fixes G17)

- SQLite: `PRAGMA wal_checkpoint(TRUNCATE)` + file copy to `~/.carbonkit/backups/`
- Add `carbonkit backup` CLI command
- Makefile target: `make backup`

### Auth & Privacy

| File | Purpose |
|------|---------|
| `shared-services/tools/auth.js` | Local JWT bearer token auth (HS256, configurable secret) |

- Workspace isolation: separate DB per workspace
- `CARBONKIT_TELEMETRY=off`, `CARBONKIT_OFFLINE=true` — zero outbound network
- All bundled reference data ships with the image

### One-Command Setup

```
make up                # SQLite + Ollama (fully offline)
make up-ollama         # Ollama + Anthropic API (CARBONKIT_LLM_BACKEND=anthropic)
make test              # Run all tests
make backup            # Snapshot database
make migrate           # FileStore → SQLite migration
```

---

## 8. Workstream 6: Testing & CI

### Test Files

| File | Coverage |
|------|----------|
| `shared-services/tools/__tests__/store-adapter.test.js` | SQLite/Postgres/File CRUD, bulkSet, concurrency, migration, audit log, blob store |
| `scope3-calculation/tools/__tests__/calc-mcp.test.js` | Ingest, compute hierarchy (all 4 methods), FX normalization, DQS, export, factor matching, CSV escaping |
| `scope3-execution/tools/__tests__/exec-mcp.test.js` | Pipeline (real stages), PDF render, OCR, maturity scoring, quality gates, provenance chain, rate limiting |
| `scope3-strategy/tools/__tests__/strategy-mcp.test.js` | Assessment lifecycle, IRO CRUD, scoring, evidence dedup, materiality matrix, snapshot verify, risk scan |
| `scope12-accounting/tools/__tests__/scope12-mcp.test.js` | Scope 1 (all 4 source types), Scope 2 (dual ledger), KPI normalization, hard gates, evidence validation |
| `swarms/tools/__tests__/swarm-mcp.test.js` | YAML validation, DAG resolution, stage execution, merge strategies, gate checks, self-healing |
| `connectors/tools/__tests__/connectors-mcp.test.js` | Schema mapping, NAICS crosswalk, CSV/Excel ingest, preview, validation |
| `test-fixtures/` | Sample spend CSV, emission factors JSON, sample PDF, GWP tables, Scope 1/2 source data |

### CI Pipeline: `.github/workflows/ci.yml`

```yaml
jobs:
  validate:
    - Validate all plugin.json files
    - MCP server selftest (health check) for all 5 servers
  test-db:
    - Store adapter tests (SQLite)
    - Migration roundtrip (file → sqlite)
  test-calc:
    - Calculation engine tests
  test-exec:
    - Execution pipeline tests (with real PDF/OCR)
  test-strategy:
    - Strategy lifecycle tests
  test-scope12:
    - Scope 1/2 calculation tests
  test-connectors:
    - Schema mapping tests
  docker:
    - Docker build verification
    - Container startup test
```

---

## 9. Workstream 7: Connectors & Schema Mapping

### New Plugin: `plugins/connectors/`

```
connectors/
  .claude-plugin/plugin.json
  .mcp.json                            # External MCP server registry
  tools/connectors-mcp.js              # Schema mapping engine
  tools/rest-adapter.js                # Generic OpenAPI→MCP wrapper (Stainless pattern)
  agents/
    data-ingestion-orchestrator.md     # Routes data from any source through right mapping
    erp-connector-specialist.md        # SAP/Oracle/Dynamics extraction expert
    travel-expense-analyst.md          # Concur/Navan → Cat 6/7 specialist
    card-spend-classifier.md           # Brex/Ramp MCC → emission category mapper
    schema-mapper.md                   # Configures/debugs field mappings for new sources
  commands/
    ingest-from.md                     # /carbon:connect:ingest-from <source>
    list-connectors.md                 # /carbon:connect:list
    map-preview.md                     # /carbon:connect:preview
    configure-source.md                # /carbon:connect:configure
  skills/
    schema-mapping/SKILL.md
    erp-data-patterns/SKILL.md
    travel-emission-methods/SKILL.md
    mcc-classification/SKILL.md
  mappings/                            # Pre-built field mapping configs (YAML)
    sap-s4hana.yaml
    oracle-netsuite.yaml
    dynamics-365.yaml
    xero.yaml
    quickbooks.yaml
    coupa.yaml
    concur.yaml
    brex-ramp.yaml
    generic-csv.yaml
    generic-excel.yaml
  data/                                # Bundled lookup tables
    unspsc_to_naics.json               # UNSPSC codes → NAICS 6-digit (~2,500 rows)
    mcc_to_naics.json                  # Merchant Category Code → NAICS (~400 rows)
    material_group_to_unspsc.json      # SAP material groups → UNSPSC (~500 rows)
    coupa_taxonomy_to_unspsc.json      # Coupa categories → UNSPSC (~300 rows)
    travel_emission_factors.json       # Distance-based: flights, hotels, rail, cars (~80 rows)
    naics_to_eeio.json                 # NAICS → EPA EEIO emission factors (~1,016 rows)
```

### Canonical Format (7 fields)

Every external data source maps to this intermediate format before entering `calc.ingest`:

```json
{
  "vendor": "string",
  "amount": "number",
  "currency": "string (ISO 4217)",
  "quantity": "number | null",
  "unit": "string | null",
  "category": "string (NAICS 6-digit or UNSPSC)",
  "date": "string (ISO 8601)",
  "org_unit": "string | null"
}
```

### connectors-mcp.js Tools (5)

| Tool | Description |
|------|-------------|
| `connectors.list` | List available connector configs and their status |
| `connectors.map` | Transform source data through a mapping config → canonical format |
| `connectors.ingest` | Map + feed directly into calc.ingest (end-to-end) |
| `connectors.validate` | Check source data against mapping schema, report unmapped fields |
| `connectors.preview` | Show mapped output without persisting |

### Schema Mapping Config Format

```yaml
# Example: mappings/sap-s4hana.yaml
source: sap-s4hana
display_name: SAP S/4HANA Purchase Orders
api_type: odata
auth: oauth2
canonical_mapping:
  vendor: "Supplier"
  amount: "NetPriceAmount"
  currency: "DocumentCurrency"
  quantity: "OrderQuantity"
  unit: "PurchaseOrderQuantityUnit"
  category: "MaterialGroup"
  date: "PurchaseOrderDate"
  org_unit: "CompanyCode"
transforms:
  date: "iso8601"
  category_lookup: "material_group_to_unspsc"
  currency: "iso4217_validate"
  amount: "multiply(NetPriceAmount, OrderQuantity)"
pagination:
  type: "odata"
  page_size: 500
```

### External MCP Server Registry (.mcp.json)

```json
{
  "mcpServers": {
    "excel": { "command": "npx", "args": ["@negokaz/excel-mcp-server"] },
    "browser": { "command": "npx", "args": ["@anthropic-ai/mcp-playwright"] },
    "filesystem": { "command": "npx", "args": ["@anthropic-ai/mcp-filesystem", "--root", "."] },
    "pdf-reader": { "command": "npx", "args": ["@anthropic-ai/mcp-pdf-reader"] },
    "xero": { "command": "npx", "args": ["xero-mcp-server"], "env": { "XERO_CLIENT_ID": "", "XERO_CLIENT_SECRET": "" } },
    "sequential-thinking": { "command": "npx", "args": ["@anthropic-ai/mcp-sequential-thinking"] }
  }
}
```

### Integration Priority

| Phase | Sources | Approach |
|-------|---------|----------|
| 1 | Excel, CSV, Google Sheets, Browser, PDF, Xero, QuickBooks | Use existing MCP servers |
| 2 | Concur, Coupa, Brex/Ramp, Dynamics 365 | Build custom via OpenAPI/Stainless |
| 3 | Sage, MYOB, Exact Online | Merge/Apideck unified API |
| 4 | SAP S/4HANA, Oracle Fusion, Workday | Complex enterprise connectors |

---

## 10. Workstream 8: Seed Data & Reference Bundles

**Goal** (Fixes G4): Ship usable reference data so the platform works out of the box.

### Scope 3 Emission Factors

| File | Content | Records | Source |
|------|---------|---------|--------|
| `scope3-calculation/data/eeio_factors_v1.3.json` | EPA EEIO spend-based factors by NAICS-6 | ~1,016 | US EPA Supply Chain GHG v1.3 |
| `scope3-calculation/data/defra_factors_2024.json` | UK DEFRA conversion factors (fuels, transport, waste, materials) | ~300 | UK DEFRA 2024 |
| `scope3-calculation/data/transport_factors.json` | Distance-based transport factors by mode and vehicle type | ~60 | GLEC Framework |
| `scope3-calculation/data/hotel_factors.json` | Hotel emission factors by country/region | ~50 | Cornell Hotel Sustainability Benchmarking |

### Scope 1/2 Reference Data

| File | Content | Records | Source |
|------|---------|---------|--------|
| `scope12-accounting/data/gwp_ar5.json` | AR5 GWP-100 values | ~20 | IPCC AR5 |
| `scope12-accounting/data/gwp_ar6.json` | AR6 GWP-100 values | ~20 | IPCC AR6 |
| `scope12-accounting/data/grid_factors_2024.json` | Grid emission factors by region | ~100 | eGRID (US) + IEA (international) |
| `scope12-accounting/data/combustion_factors.json` | Fuel combustion emission factors | ~50 | EPA AP-42 + IPCC defaults |
| `scope12-accounting/data/refrigerant_gwp.json` | Refrigerant GWP values for fugitive emissions | ~30 | IPCC/Ashrae |

### Demo/Test Data

| File | Content | Purpose |
|------|---------|---------|
| `test-fixtures/sample_spend_100rows.csv` | 100-row spend dataset (realistic categories, currencies, vendors) | Demo ingest + compute |
| `test-fixtures/sample_suppliers_20.json` | 20 supplier records with categories and ratings | Demo execution pipeline |
| `test-fixtures/sample_scope1_sources.json` | Scope 1 activity data (stationary + mobile + fugitive) | Demo scope12 engine |
| `test-fixtures/sample_scope2_energy.json` | Scope 2 energy data with EAC certificates | Demo dual-ledger |
| `test-fixtures/sample_report.pdf` | Small PDF for testing render_page + OCR | Integration testing |

### Seeding Flow

On first `make up` or `carbonkit init`, the system:
1. Checks if `emission_factors` collection is empty
2. If empty, runs `bulkSet` to load bundled factors
3. Logs seeding event to audit trail

---

## 11. ERP/CRM/SaaS Schema Mapping Research

### 11.1 Enterprise ERP Mappings

#### SAP S/4HANA → CarbonKit

| SAP Field | CarbonKit Field | Transform |
|-----------|----------------|-----------|
| `EKPO.NETPR × EKPO.MENGE` | `activity_rows.spend_original` | Multiply |
| `EKKO.LIFNR → LFA1.NAME1` | `activity_rows.vendor` | Vendor number → name lookup |
| `EKPO.MATKL` | `activity_rows.category` | Material group → NAICS via `material_group_to_unspsc.json` then `unspsc_to_naics.json` |
| `EKKO.WAERS` | `activity_rows.currency_original` | ISO 4217 direct |
| `EKPO.MENGE` | `activity_rows.quantity` | Direct |
| `EKPO.MEINS` | `activity_rows.unit` | SAP UoM → ISO unit mapping |
| `EKKN.SAKTO` | `activity_rows.gl_code` | GL account direct |
| `LFA1.NAME1` | `suppliers.supplier_name` | Direct |
| `LFA1.BRSCH` | `suppliers.category` | Industry key → sector |
| `SAP SFM Item Footprints API` | `emission_factors.kgco2e_per_unit` | Product carbon footprints (primary data) |

**API**: OData v4 (`API_PURCHASEORDER_PROCESS_SRV`), REST (Sustainability Footprint Mgmt)
**Auth**: OAuth 2.0 (BTP) or X.509

#### Oracle Fusion / NetSuite → CarbonKit

| Oracle Field | CarbonKit Field | Transform |
|-------------|----------------|-----------|
| `PO.lines[].UnitPrice × Quantity` | `activity_rows.spend_original` | Multiply |
| `PO.SupplierId → supplierslov` | `activity_rows.vendor` | Supplier LOV lookup |
| `PO.lines[].CategoryId → browsingCategories` | `activity_rows.category` | Procurement cat → NAICS |
| `PO.CurrencyCode` | `activity_rows.currency_original` | ISO 4217 direct |
| NetSuite `VendorBill.item[].amount` | `activity_rows.spend_original` | Direct |
| NetSuite `Vendor.companyName` | `activity_rows.vendor` | Direct |
| Oracle Sustainability Ledger | `emissions` | Auto-calculated by Oracle |

**API**: Oracle REST (`/fscmRestApi`), NetSuite REST + SuiteQL
**Auth**: OAuth 2.0

#### Microsoft Dynamics 365 → CarbonKit

| D365 Field | CarbonKit Field | Transform |
|-----------|----------------|-----------|
| `msdyn_PurchasedGoodsActivities.spendamount` | `activity_rows.spend_original` | Direct |
| `msdyn_*.quantity` | `activity_rows.quantity` | Direct |
| `msdyn_*.unit` | `activity_rows.unit` | Dataverse UoM → ISO |
| `msdyn_*.customdimension` | `activity_rows.category` | Custom dim → NAICS |
| `EmissionFactor.co2evalue` | `emission_factors.kgco2e_per_unit` | Direct |
| `Emission.co2e` | `emissions.tco2e` | Direct |

**API**: Dataverse Web API (OData v4)
**Auth**: Azure AD / Entra ID OAuth 2.0
**Note**: D365 Sustainability Manager ships EPA 2025 factors — can seed CarbonKit's factors.

#### Salesforce Net Zero Cloud → CarbonKit

| Salesforce Object | CarbonKit Field | Transform |
|------------------|----------------|-----------|
| `Scope3ProcurementItem.Amount` | `activity_rows.spend_original` | Direct |
| `Scope3ProcurementItem.Quantity` | `activity_rows.quantity` | Direct |
| `Account.Name` | `suppliers.supplier_name` | Direct |
| `Account.Industry` | `suppliers.category` | SF Industry → NAICS |
| `ProcurementEmissionFctr.EmissionFactorValue` | `emission_factors.kgco2e_per_unit` | Direct |
| `EmissionsActivity.ActivityValue` | `emissions.tco2e` | Direct |

**API**: REST API (SOQL), Bulk API 2.0
**Auth**: OAuth 2.0 (JWT Bearer)

#### Workday → CarbonKit

| Workday Field | CarbonKit Field | Transform |
|--------------|----------------|-----------|
| `SupplierInvoice.Total_Amount` | `activity_rows.spend_original` | Direct |
| `SupplierInvoice.Spend_Category` | `activity_rows.category` | Workday cat → NAICS |
| `SupplierInvoice.Supplier.name` | `activity_rows.vendor` | Direct |
| `ExpenseReport.Item_Amount` | `activity_rows.spend_original` | Direct (Cat 6) |
| `Supplier.Supplier_Name` | `suppliers.supplier_name` | Direct |

**API**: RaaS (Report-as-a-Service)
**Auth**: OAuth 2.0 with non-expiring refresh tokens

#### QuickBooks / Xero → CarbonKit

| QB/Xero Field | CarbonKit Field | Transform |
|--------------|----------------|-----------|
| QB `Bill.Line[].Amount` / Xero `Invoice.LineItems[].LineAmount` | `activity_rows.spend_original` | Direct |
| QB `Bill.VendorRef → Vendor.DisplayName` / Xero `Invoice.Contact.Name` | `activity_rows.vendor` | Lookup |
| QB `Bill.Line[].AccountRef → Account` / Xero `LineItem.AccountCode → Account` | `activity_rows.gl_code` | Direct, then GL → NAICS (per-client mapping) |
| QB `Bill.CurrencyRef` / Xero `Invoice.CurrencyCode` | `activity_rows.currency_original` | ISO 4217 |

**API**: QB REST v3 / Xero Accounting API
**Auth**: Both OAuth 2.0
**Rate Limits**: QB 500K/month; Xero 60/min, 5K/day
**Key Challenge**: No native carbon features. GL-to-NAICS mapping is client-specific.

### 11.2 High-Growth SaaS Mappings by Scope 3 Category

#### Category 1 — Purchased Goods & Services (Procurement Portals)

| Vendor | Carbon Data | API | Auth |
|--------|-------------|-----|------|
| **Coupa** | UNSPSC codes, EcoVadis ratings, GHG models, spend by category | REST (JSON/XML) | OAuth2 |
| **SAP Ariba** | PACT V2 PCFs, supplier sustainability profiles, UNSPSC | REST via SAP BTP | OAuth2 |
| **JAGGAER** | Carbmee PCF data, ESG scoring, Scope 3 hotspots | REST | OAuth2/API key |
| **GEP SMART** | CDP Gold data, emissions dashboard, CO2/supplier | REST (Azure) | OAuth2 (Azure AD) |
| **Ivalua** | Environmental Impact Center, EcoVadis IQ Plus, CO2/category | REST | OAuth2 |

#### Category 4/9 — Transportation & Distribution

| Vendor | Carbon Data | API | Accreditation |
|--------|-------------|-----|---------------|
| **Flexport** | Per-shipment CO2e (all modes), weight, distance, fuel type | REST (JSON) | SFC accredited |
| **project44** | GLEC-accredited CO2e, carrier-level, lane-level | REST | GLEC accredited |
| **FourKites** | Load-weight-adjusted CO2e, modal analysis | REST | -- |
| **Transporeon** | GLEC CO2e, telematics fuel data, audit-proof reports | REST/SaaS | GLEC accredited |

**Key Insight**: Flexport, project44, Transporeon provide **primary data** (SFC/GLEC-accredited). Maps directly to `activity_rows.primary_data.emissions_total_kgco2e` → triggers CarbonKit's `supplier_primary` method (highest quality).

#### Category 6 — Business Travel

| Vendor | Carbon Data | API | Auth |
|--------|-------------|-----|------|
| **SAP Concur** | ISO 14083 CO2e (Thrust Carbon), IATA codes, cabin class, hotel nights, car mileage | REST v4 | OAuth2 (Unified Token) |
| **Navan** | Per-segment CO2e (Carbon View), DEFRA/TREMOD/ICAO methods | REST | OAuth2/API key |
| **Brex** | MCC-categorized travel spend, transaction amounts | REST (OpenAPI) | OAuth2 |
| **Ramp** | MCC transactions, trip booking details | REST (OpenAPI) | Bearer Token |

**Method hierarchy for travel**: Concur ISO 14083 or Navan Carbon View → `supplier_primary`. Flight distance × cabin class → `average_quantity`. MCC spend × EEIO → `spend`.

#### Category 5 — Waste

| Vendor | Carbon Data | API |
|--------|-------------|-----|
| **Rubicon** | Waste volumes by type/disposal method, diversion rates, Cat 5 emissions | REST/Portal (RUBICONConnect) |

#### Category 7 — Employee Commuting

| Vendor | Carbon Data | API |
|--------|-------------|-----|
| **RideAmigos** | GPS-verified trips, mode, distance, VMT, Scope 3 Cat 7 reporting | REST |
| **Luum** | Commute mode, distance, frequency, department/worksite | REST |

#### Scope 1 — Fleet Telematics

| Vendor | Carbon Data | API | Auth |
|--------|-------------|-----|------|
| **Samsara** | Fuel consumption/vehicle, distance, idle time, EPA-based emissions | REST (OpenAPI) | Bearer Token |
| **Geotab** | Fuel/energy per trip, fuel type, EV kWh, Green Fleet Dashboard | JSON-RPC | Session |

#### Scope 2 — Energy & Utilities

| Vendor | Carbon Data | API | Coverage |
|--------|-------------|-----|----------|
| **Arcadia (UtilityAPI)** | kWh per meter, billing period, grid region, interval data (15-min), REC data | REST + Green Button XML | 80%+ US electric |

#### Scope 2/3 — Cloud Infrastructure

| Provider | Carbon Data | Access | Format |
|----------|-------------|--------|--------|
| **AWS** | Scope 1/2/3 by service/region/account (monthly) | S3 export (Carbon Emissions Data Exports) | CSV/Parquet |
| **Google Cloud** | Gross carbon by project/product/region, CFE% | BigQuery Data Transfer | SQL-queryable |
| **Azure** | Scope 1/2/3 by subscription (12mo API, 5yr dashboard) | REST API (Preview) + Power BI | JSON/Excel |

#### Real Estate & Facilities

| Vendor | Carbon Data | API |
|--------|-------------|-----|
| **IBM Envizi** | 140K emission factor datasets, per-facility GHG, GRESB benchmarks | REST |
| **Measurabl** | 70 data points per asset, energy/water consumption, ESG scores | REST (Premium) |
| **Watershed** | Per-facility emissions (audit-ready), anomaly detection | REST |

#### Financial Aggregators (Spend-Based Fallback)

| Vendor | Carbon Data | API | Auth |
|--------|-------------|-----|------|
| **Plaid** | MCC-coded transactions, merchant name, category, amount, currency | REST | OAuth2 + Link |
| **Yodlee** | ML-categorized transactions, merchant data | REST v1.1 | OAuth2 (cobrand) |
| **MX** | Cleansed/categorized transactions, spending patterns | REST | API key |

**Use case**: For SMEs without ERP. MCC → NAICS → EEIO emission factor → spend-based Scope 3.

### 11.3 Classification Crosswalk Engine

```
┌──────────────────────────────────────────────────────────────────┐
│                    CLASSIFICATION CROSSWALK ENGINE                │
│                                                                  │
│  Input Code Systems         Canonical Hub          Output        │
│  ─────────────────         ─────────────          ──────         │
│  SAP Material Group (MATKL)  ─┐                                 │
│  Oracle Procurement Category ──┤                                │
│  UNSPSC (Coupa/Ariba)       ──┤    ┌──────────┐   EPA EEIO     │
│  MCC (Plaid/Brex/Ramp)     ──┼───→│ NAICS-6  │──→ factor_id   │
│  Xero/QB Account Code       ──┤    │ (1,016   │   EXIOBASE     │
│  D365 Custom Dimension      ──┤    │ sectors) │   Climatiq     │
│  NACE Rev.2 (EU systems)   ──┤    └──────────┘   DEFRA         │
│  ISIC Rev.4 (UN standard)  ──┘                    ecoinvent     │
│                                                                  │
│  Crosswalk Tables (bundled in connectors/data/):                 │
│    mcc_to_naics.json          ~400 rows                          │
│    unspsc_to_naics.json       ~2,500 rows                        │
│    material_group_to_unspsc.json  ~500 rows                      │
│    naics_to_eeio.json         ~1,016 rows                        │
│    coupa_taxonomy_to_unspsc.json  ~300 rows                      │
│    nace_to_naics.json         ~600 rows  (future)                │
│    isic_to_naics.json         ~400 rows  (future)                │
└──────────────────────────────────────────────────────────────────┘
```

---

## 12. Swarm Team Build Strategy

### Decision

Use Claude Code's native `TeamCreate`/`SendMessage`/`Task` for swarm runtime. Build all workstreams in parallel using a 4-agent team.

### Team Composition

```
Team Lead (you) — coordinates, reviews, unblocks
  ├─ DB & MCP Lead     — Workstreams 1, 2, 3
  ├─ Swarm Lead        — Workstream 4
  ├─ Connectors Lead   — Workstreams 7, 5, 8
  └─ Quality Lead      — Workstream 6
```

### Execution Order

#### Gate 0: DB Foundation (Must Complete First — Unblocks Everything)

| Step | Task | Owner |
|------|------|-------|
| 0.1 | Create `store-adapter.js` with file/sqlite/blob backends | DB Lead |
| 0.2 | Create `validate.js` and `mcp-helpers.js` | DB Lead |
| 0.3 | Wire all 3 existing MCP servers to new adapter | DB Lead |
| 0.4 | Fix `carbonkit-cli.js` MCP framing bug | DB Lead |
| 0.5 | Run `test-mcp-servers.js` to verify no regression | Quality Lead |

#### After Gate 0 — All 4 Leads Work in Parallel

**DB & MCP Lead (Workstreams 2 + 3)**:

| Step | Task |
|------|------|
| 1 | Implement real `exec.render_page` (pdfjs-dist + @napi-rs/canvas) |
| 2 | Implement real `exec.ocr` (tesseract.js WASM) |
| 3 | Fix `exec.upload_pdf` to store binary in blob store |
| 4 | Make exec pipeline stages real (seed, sources, ingest, seed_data, generate) |
| 5 | Implement local corpus `strategy.risk_scan` |
| 6 | Add `strategy.snapshot.verify` |
| 7 | Enhance factor matching in calc-mcp (category, vendor, geography) |
| 8 | Fix CSV export quoting (RFC 4180) |
| 9 | Add bulkSet tools to all 3 servers |
| 10 | Add rate limiting to exec-mcp |
| 11 | Add job status lifecycle (PENDING → PROCESSING → DONE) |
| 12 | Add compute checkpoint every 100 groups |
| 13 | Fix evidence dedup key, configurable materiality threshold |
| 14 | Add input validation + standardize errors across all servers |
| 15 | Create `scope12-mcp.js` (protocol boilerplate from calc-mcp pattern) |
| 16 | Implement Scope 1 engine (4 source types, GWP, biogenic separation) |
| 17 | Implement Scope 2 dual-ledger engine |
| 18 | Implement KPI normalization + report export |
| 19 | Bundle Scope 1/2 reference data (GWP, grid factors, combustion factors) |
| 20 | Implement real `exec.export` PDF generation |

**Swarm Lead (Workstream 4)**:

| Step | Task |
|------|------|
| 21 | Create swarms plugin structure + plugin.json |
| 22 | Define `swarm-v1.schema.json` |
| 23 | Build `swarm-mcp.js` core (run, status, gate.check, merge, recover) |
| 24 | Write agent markdowns (conductor, supervisor, merge-operator, recovery-operator) |
| 25 | Write 8 workflow YAML templates |
| 26 | Write swarm commands (/carbon:swarm:run, /carbon:swarm:status, etc.) |
| 27 | Write 4 skill files (dag-resolution, agent-dispatch, result-merge, self-healing) |
| 28 | Add `esg-full-swarm` team to teams.json |

**Connectors Lead (Workstreams 7 + 5 + 8)**:

| Step | Task |
|------|------|
| 29 | Create connectors plugin structure + plugin.json |
| 30 | Build `connectors-mcp.js` (list, map, ingest, validate, preview) |
| 31 | Write all 10 mapping configs (SAP, NetSuite, D365, Xero, QBO, Coupa, Concur, Brex/Ramp, CSV, Excel) |
| 32 | Bundle 6 lookup tables (UNSPSC, MCC, material groups, Coupa taxonomy, NAICS→EEIO, travel factors) |
| 33 | Write 5 agent markdowns + 4 commands + 4 skills |
| 34 | Configure `.mcp.json` with external MCP server registry |
| 35 | Build `rest-adapter.js` (generic OpenAPI→MCP wrapper) |
| 36 | Create `mcp-http-transport.js`, add transport selection to all servers |
| 37 | Create Dockerfiles + `docker-compose.yml` + Makefile + `.env.example` |
| 38 | Create `llm-router.js` + `agent-runtime.js` |
| 39 | Create `logger.js` + `metrics.js` (observability) |
| 40 | Create `auth.js` (JWT auth) |
| 41 | Bundle Scope 3 emission factors (EEIO, DEFRA, transport, hotel) |
| 42 | Create demo/test fixtures (sample spend, suppliers, scope1/2 data, PDF) |

**Quality Lead (Workstream 6 — Runs Throughout)**:

| Step | Task |
|------|------|
| 43 | Write store adapter tests (after Gate 0) |
| 44 | Write calc-mcp functional tests (as factor matching is enhanced) |
| 45 | Write exec-mcp tests (as stubs get completed) |
| 46 | Write strategy-mcp tests (as risk_scan + snapshot.verify land) |
| 47 | Write scope12-mcp calculation tests (after scope12 engine) |
| 48 | Write connector mapping tests (after connectors-mcp) |
| 49 | Write swarm orchestration tests (after swarm-mcp) |
| 50 | Create `.github/workflows/ci.yml` |
| 51 | Run integration tests across all workstreams |
| 52 | Normalize tool naming in calc commands (bare → `mcp__calc-local__`) |
| 53 | Update/remove stale README references (hooks.json, etc.) |

---

## 13. Complete File Manifest

### New Files (~75)

#### Workstream 1: Unified Database Layer (6 files)

```
shared-services/tools/store-adapter.js
shared-services/tools/backends/file-store.js
shared-services/tools/backends/sqlite-store.js
shared-services/tools/backends/postgres-store.js
shared-services/tools/backends/blob-store.js
shared-services/tools/migrate-filestore.js
```

#### Workstream 2: Stub Completion + Fixes (3 files)

```
scope3-strategy/data/risk-intelligence-baseline.json
shared-services/tools/validate.js
shared-services/tools/mcp-helpers.js
```

#### Workstream 3: Scope 1/2 MCP Server (6 files)

```
scope12-accounting/tools/scope12-mcp.js
scope12-accounting/data/gwp_ar5.json
scope12-accounting/data/gwp_ar6.json
scope12-accounting/data/grid_factors_2024.json
scope12-accounting/data/combustion_factors.json
scope12-accounting/data/refrigerant_gwp.json
```

#### Workstream 4: Swarm Orchestration (21 files)

```
swarms/.claude-plugin/plugin.json
swarms/.mcp.json
swarms/tools/swarm-mcp.js
swarms/agents/swarm-conductor.md
swarms/agents/stage-supervisor.md
swarms/agents/merge-operator.md
swarms/agents/recovery-operator.md
swarms/commands/run-swarm.md
swarms/commands/list-swarms.md
swarms/commands/status.md
swarms/commands/replay.md
swarms/skills/dag-resolution/SKILL.md
swarms/skills/agent-dispatch/SKILL.md
swarms/skills/result-merge/SKILL.md
swarms/skills/self-healing/SKILL.md
swarms/workflows/rapid-baseline.yaml
swarms/workflows/full-scope3-audit.yaml
swarms/workflows/supplier-engagement-blitz.yaml
swarms/workflows/csrd-disclosure-prep.yaml
swarms/workflows/scope12-annual-close.yaml
swarms/workflows/cross-scope-reconciliation.yaml
swarms/workflows/risk-intelligence-sweep.yaml
swarms/workflows/data-collection-sweep.yaml
swarms/schema/swarm-v1.schema.json
```

#### Workstream 5: Self-Hosting Infrastructure (12 files)

```
shared-services/tools/mcp-http-transport.js
shared-services/tools/llm-router.js
shared-services/tools/agent-runtime.js
shared-services/tools/logger.js
shared-services/tools/metrics.js
shared-services/tools/auth.js
docker/Dockerfile.mcp-servers
docker/Dockerfile.agent-runtime
docker/init-db.sql
docker-compose.yml
docker-compose.postgres.yml
docker-compose.ollama.yml
.env.example
Makefile
```

#### Workstream 6: Testing & CI (9 files)

```
shared-services/tools/__tests__/store-adapter.test.js
scope3-calculation/tools/__tests__/calc-mcp.test.js
scope3-execution/tools/__tests__/exec-mcp.test.js
scope3-strategy/tools/__tests__/strategy-mcp.test.js
scope12-accounting/tools/__tests__/scope12-mcp.test.js
swarms/tools/__tests__/swarm-mcp.test.js
connectors/tools/__tests__/connectors-mcp.test.js
.github/workflows/ci.yml
test-fixtures/  (directory with 5 fixture files)
```

#### Workstream 7: Connectors & Schema Mapping (30 files)

```
connectors/.claude-plugin/plugin.json
connectors/.mcp.json
connectors/tools/connectors-mcp.js
connectors/tools/rest-adapter.js
connectors/agents/data-ingestion-orchestrator.md
connectors/agents/erp-connector-specialist.md
connectors/agents/travel-expense-analyst.md
connectors/agents/card-spend-classifier.md
connectors/agents/schema-mapper.md
connectors/commands/ingest-from.md
connectors/commands/list-connectors.md
connectors/commands/map-preview.md
connectors/commands/configure-source.md
connectors/skills/schema-mapping/SKILL.md
connectors/skills/erp-data-patterns/SKILL.md
connectors/skills/travel-emission-methods/SKILL.md
connectors/skills/mcc-classification/SKILL.md
connectors/mappings/sap-s4hana.yaml
connectors/mappings/oracle-netsuite.yaml
connectors/mappings/dynamics-365.yaml
connectors/mappings/xero.yaml
connectors/mappings/quickbooks.yaml
connectors/mappings/coupa.yaml
connectors/mappings/concur.yaml
connectors/mappings/brex-ramp.yaml
connectors/mappings/generic-csv.yaml
connectors/mappings/generic-excel.yaml
connectors/data/unspsc_to_naics.json
connectors/data/mcc_to_naics.json
connectors/data/material_group_to_unspsc.json
connectors/data/coupa_taxonomy_to_unspsc.json
connectors/data/naics_to_eeio.json
connectors/data/travel_emission_factors.json
```

#### Workstream 8: Seed Data (9 files)

```
scope3-calculation/data/eeio_factors_v1.3.json
scope3-calculation/data/defra_factors_2024.json
scope3-calculation/data/transport_factors.json
scope3-calculation/data/hotel_factors.json
test-fixtures/sample_spend_100rows.csv
test-fixtures/sample_suppliers_20.json
test-fixtures/sample_scope1_sources.json
test-fixtures/sample_scope2_energy.json
test-fixtures/sample_report.pdf
```

### Modified Files (~15)

```
scope3-calculation/tools/calc-mcp.js        # Delete inline FileStore, import store-adapter, fix get(), fix CSV, enhance factor matching
scope3-execution/tools/exec-mcp.js          # Delete inline FileStore, implement render_page/ocr/upload_pdf/pipeline, add rate limiting
scope3-strategy/tools/strategy-mcp.js       # Delete inline FileStore, implement risk_scan/snapshot.verify, fix delete guard
shared-services/tools/carbonkit-cli.js      # Fix MCP framing (Content-Length header)
scope12-accounting/.mcp.json                # Add scope12-local server
scope12-accounting/.claude-plugin/plugin.json  # Add mcpServers reference
plugins/package.json                        # Add better-sqlite3, pg, pdfjs-dist, tesseract.js, @napi-rs/canvas, pdfkit, pino
plugins/teams/teams.json                    # Add esg-full-swarm team
plugins/README.md                           # Remove stale hooks.json references, add new plugins
plugins/test-mcp-servers.js                 # Add scope12 and swarm server tests
scope3-calculation/commands/carbon-calc-*.md (6 files)  # Normalize tool names to mcp__calc-local__ prefix
```

### Total: ~90 new/modified files

---

## 14. Verification Plan

| # | Test | What It Validates |
|---|------|-------------------|
| 1 | `node test-mcp-servers.js` + all `__tests__/*.test.js` against SQLite | Unit: all tools, engines, gates |
| 2 | `make migrate` on sample FileStore data | Migration: timestamps normalized, data intact |
| 3 | Ingest `sample_spend_100rows.csv` → `calc.ingest` → `calc.compute` | End-to-end: spend-based Scope 3 calculation |
| 4 | Upload `sample_report.pdf` → `exec.render_page` → `exec.ocr` → `exec.provenance.save` | End-to-end: real PDF rendering and OCR |
| 5 | Run `scope12.scope1.calculate` with `sample_scope1_sources.json` | Scope 1: all 4 source types, GWP, biogenic |
| 6 | Run `scope12.scope2.calculate` with `sample_scope2_energy.json` | Scope 2: dual ledger, EAC validation, net import |
| 7 | Execute `rapid-baseline.yaml` swarm with sample spend data | Swarm: DAG resolution, stage execution, gate checks, deliverable assembly |
| 8 | Execute `full-scope3-audit.yaml` with mock org data | Swarm: full 5-stage pipeline, all 14 agents, SHA-256 deliverable |
| 9 | Ingest CSV through `connectors.ingest` with `generic-csv.yaml` mapping | Connectors: schema mapping, NAICS crosswalk, activity_rows creation |
| 10 | `connectors.map` with `sap-s4hana.yaml` on sample SAP export | Connectors: ERP mapping, material group → UNSPSC → NAICS |
| 11 | `make up && make test` | Docker: all services start, health checks pass, tests pass |
| 12 | `CARBONKIT_OFFLINE=true make up` | Offline: zero outbound network, bundled factors work |
| 13 | Cross-plugin view: `view('org_footprint', { year: 2024 })` | Unified DB: aggregates Scope 1 + 2 + 3 from different plugins |
| 14 | `strategy.snapshot.verify` after modifying an IRO | Integrity: drift detection works |
| 15 | Seed empty DB → verify emission_factors populated | Seed: auto-seeding on first run |
| 16 | `connectors.preview` with Brex transaction data | Classification: MCC → NAICS → EEIO factor resolution |
| 17 | `exec.quality_gates` after full pipeline | Quality: all 5 gates pass with real data |
| 18 | `carbonkit backup` + restore cycle | Backup: SQLite checkpoint + file copy + restore verification |

---

## Appendix A: Complete Collection Schema Reference

### scope3-calculation Collections

#### jobs
```
_id              string (UUID)
filename         string
status           "PENDING" | "PROCESSING" | "DONE" | "FAILED"
row_count        number
reporting_currency string
reconciliation   {
  missing: { MISSING_VENDOR: n, MISSING_DESCRIPTION: n, MISSING_SPEND: n, ... }
  missing_pct: { [key]: number }
  currencies: string[]
  units: string[]
  distinct_counts: { vendors: n, items: n }
  rows_with_any_flag: number
  rows_clean: number
  spend_total: number
  quantity_total: number
}
latest_run_id    string | null
closed_at        string | null (ISO 8601)
closed_run_id    string | null
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### activity_rows
```
_id              string (UUID)
job_id           string → jobs._id
row_index        number
vendor           string | null
item_description string | null
gl_code          string | null
category         string | null
spend_original   number
currency_original string | null
quantity         number | null
unit             string | null
primary_data     { emissions_total_kgco2e?: n, kgco2e_per_unit?: n } | null
data_quality_flags string[]
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### emission_factors
```
_id              string (UUID)
factor_id        string | null
basis            "quantity" | "spend"
kgco2e_per_unit  number
category         string | null
vendor           string | null
unit             string | null
currency         string | null
source           string | null
geography        string | null
last_updated     string | null (ISO 8601)
```

#### fx_rates
```
_id              string (UUID)
pair             string (e.g., "EUR/USD")
rate             number
source           string | null
effective_date   string | null (ISO 8601)
```

#### inventory_items
```
_id              string (UUID)
job_id           string → jobs._id
run_id           string → lca_runs._id
vendor           string | null
item_description string | null
category         string | null
method           "supplier_primary" | "average_quantity" | "spend" | "none"
match_quality    "exact" | "category" | "category_broad" | "fallback" | "none"
emissions_total_kgco2e number
emissions_total_tco2e  number
spend_original   number
spend_reporting  number
quantity_total   number
unit             string | null
factor_id        string | null → emission_factors._id
reason           string
row_count        number
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### inventory_item_versions
```
_id              string (UUID)
job_id           string → jobs._id
run_id           string → lca_runs._id
vendor, item_description, category, method, match_quality (same as inventory_items)
emissions_total_kgco2e, emissions_total_tco2e, spend_original, spend_reporting
quantity_total, unit, factor_id, reason, row_count (same as inventory_items)
event_type       "compute" | "primary_upgrade" | "adjustment" | "override" | "legacy_snapshot"
event_id         string
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### lca_runs
```
_id              string (UUID / run_id)
job_id           string → jobs._id
inventory_item_count number
total_spend      number
total_spend_reporting number
reporting_currency_used string
total_emissions_kgco2e number
total_emissions_tco2e  number
methodology_counts {
  supplier_primary: n, average_quantity: n, spend: n, none: n
}
_created_at      string (ISO 8601)
```

#### lca_run_history
```
_id              string (UUID)
job_id           string → jobs._id
run_id           string → lca_runs._id
(same fields as lca_runs)
_created_at      string (ISO 8601)
```

### scope3-execution Collections

#### suppliers
```
_id              string (UUID)
supplier_name    string
category         string
cee_rating       "A" | "B" | "C" | "D" | "E" | null
upstream_impact_pct number (0-100)
evidence_status  "missing_public_report" | "insufficient_context" | "ok"
recommendations_generated boolean | null
recommendation_ts string | null (ISO 8601)
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### engagements
```
_id              string (UUID)
supplier_id      string → suppliers._id
status           "not_started" | "in_progress" | "pending_response" | "completed" | "on_hold"
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### documents
```
_id              string (UUID)
filename         string
title            string
company_id       string | null → suppliers._id
category         "sustainability_report" | "cdp_response" | "general"
mime_type        "application/pdf"
blob_key         string (content-addressed in blob store)
sha256           string
page_count       number
ingested         boolean
ingested_at      string | null (ISO 8601)
uploaded_at      string (ISO 8601)
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### renders
```
_id              string (UUID)
doc_id           string → documents._id
page_number      number (1-based)
zoom             number (default 1.0)
width            number (pixels)
height           number (pixels)
blob_key         string (rendered image in blob store)
rendered_at      string (ISO 8601)
_created_at      string (ISO 8601)
```

#### ocr_blocks
```
_id              string (UUID)
doc_id           string → documents._id
page_number      number
text             string
confidence       number (0-1)
bbox             [left, top, right, bottom]
_created_at      string (ISO 8601)
```

#### provenance
```
_id              string (UUID)
entity_type      string
entity_id        string
field_key        string
doc_id           string → documents._id
page_number      number
ocr_block_ids    string[] → ocr_blocks._id
ocr_confidence_min number | null
value            string | null
unit             string | null
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### emissions
```
_id              string (UUID)
scope            1 | 2 | 3
tco2e            number
unit             string
supplier_id      string | null → suppliers._id
period           string | null
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### benchmarks
```
_id              string (UUID)
supplier_id      string → suppliers._id
benchmark_name   string
benchmark_value  number
unit             string
source           string | null
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### pipeline_runs
```
_id              string (run_id + "__" + stage)
run_id           string
stage            "seed" | "sources" | "ingest" | "seed_data" | "generate"
status           "completed" | "error"
detail           string
timestamp        string (ISO 8601)
_created_at      string (ISO 8601)
```

### scope3-strategy Collections

#### assessments
```
_id              string ("asmt_" + UUID)
org_id           string
year             number
status           "draft" | "finalized"
finalized        boolean
snapshot_count   number
finalized_at     string | null (ISO 8601)
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### iros
```
_id              string ("iro_" + UUID)
assessment_id    string → assessments._id
org_id           string
type             "impact" | "risk" | "opportunity"
topic            string (E1-E5, S1-S4, G1)
title            string
scores           {
  impact_materiality: 1-5
  financial_materiality: 1-5
  likelihood?: 1-5
  confidence?: "low" | "medium" | "high"
  scored_at: string (ISO 8601)
} | null
evidence_count   number
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### evidence (strategy)
```
_id              string ("ev_" + UUID)
iro_id           string → iros._id
assessment_id    string → assessments._id
source           string
source_hash      string (SHA-256)
stakeholder_type "internal" | "external"
description      string
captured_at      string (ISO 8601)
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### matrices
```
_id              string ("mtx_" + UUID)
assessment_id    string → assessments._id
org_id           string
year             number
threshold        number
generated_at     string (ISO 8601)
total_iros       number
scored_count     number
unscored_count   number
summary          { material: n, impact_only: n, financial_only: n, not_material: n }
quadrants        { material: [...], impact_only: [...], financial_only: [...], not_material: [...] }
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### snapshots
```
_id              string ("snap_" + UUID)
assessment_id    string → assessments._id
version          number
sha256           string
finalized        boolean
iro_count        number
evidence_count   number
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

#### risk_scans
```
_id              string ("rscan_" + UUID)
org_id           string
keywords         string[] | null
scanned_at       string (ISO 8601)
signal_count     number
channels_covered string[]
signals          [{
  signal_id: string
  channel: "regulatory" | "media" | "ngo"
  source_name: string
  jurisdiction: string
  topic_hint: string
  claim_summary: string
  scores: { severity, relevance, source_credibility, novelty, actionability }
  priority: number (0-10)
  classification: "high" | "medium" | "low"
  disposition: "pending_review"
}]
_created_at      string (ISO 8601)
_updated_at      string (ISO 8601)
```

### Cross-Plugin: _audit_log
```
timestamp        string (ISO 8601)
collection       string
operation        "set" | "delete" | "bulkSet"
doc_id           string | null
sha256           string (content hash)
```

---

## Appendix B: Foreign Key Map

```
scope3-calculation:
  activity_rows.job_id           → jobs._id
  inventory_items.job_id         → jobs._id
  inventory_items.run_id         → lca_runs._id
  inventory_items.factor_id      → emission_factors._id
  inventory_item_versions.job_id → jobs._id
  inventory_item_versions.run_id → lca_runs._id
  lca_runs.job_id                → jobs._id
  lca_run_history.job_id         → jobs._id
  lca_run_history.run_id         → lca_runs._id

scope3-execution:
  engagements.supplier_id        → suppliers._id
  documents.company_id           → suppliers._id
  renders.doc_id                 → documents._id
  ocr_blocks.doc_id              → documents._id
  provenance.doc_id              → documents._id
  provenance.entity_id           → suppliers._id (when entity_type = "supplier")
  provenance.ocr_block_ids[]     → ocr_blocks._id
  emissions.supplier_id          → suppliers._id
  benchmarks.supplier_id         → suppliers._id

scope3-strategy:
  iros.assessment_id             → assessments._id
  evidence.iro_id                → iros._id
  evidence.assessment_id         → assessments._id
  matrices.assessment_id         → assessments._id
  snapshots.assessment_id        → assessments._id

cross-plugin (via unified DB views):
  exec.suppliers ↔ calc.activity_rows.vendor
  exec.emissions ↔ calc.inventory_items
  strategy.iros  ↔ exec.engagements (topic alignment)
```

---

## Appendix C: Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CARBONKIT_DB_BACKEND` | `file` | Database backend: `file` or `sqlite` (postgres planned) |
| `CARBONKIT_DB_PATH` | `~/.carbonkit/data/carbonkit.db` | SQLite database path |
| `CARBONKIT_BLOB_BACKEND` | `fs` | Blob storage: `fs`, `s3` |
| `CARBONKIT_BLOB_PATH` | `~/.carbonkit/blobs` | Local blob storage path |
| `CARBONKIT_MCP_TRANSPORT` | `stdio` | MCP transport: `stdio`, `http` |
| `CARBONKIT_MCP_PORT` | `8401` | Base port for HTTP transport |
| `CARBONKIT_LLM_BACKEND` | `anthropic` | LLM provider: `anthropic`, `ollama`, `vllm`, `llamacpp` |
| `CARBONKIT_LLM_URL` | -- | LLM endpoint URL |
| `CARBONKIT_LLM_MODEL` | -- | Model identifier |
| `CARBONKIT_AUTH_SECRET` | (random) | JWT signing secret |
| `CARBONKIT_TELEMETRY` | `off` | Telemetry: `off`, `on` |
| `CARBONKIT_OFFLINE` | `false` | Disable all outbound network |
| `CARBONKIT_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `CARBONKIT_WORKSPACE` | `default` | Workspace name (DB isolation) |

---

## Appendix D: Hardcoded Values to Parameterize

| Value | Location | Current | Make Configurable |
|-------|----------|---------|-------------------|
| FX rates (20 pairs) | calc-mcp lines 124-144 | Hardcoded | Move to fx_rates collection, seed from bundled data |
| DQS penalty weights | calc-mcp lines 165-172 | Hardcoded | Keep hardcoded (methodology-defined) |
| Method quality scores | calc-mcp lines 174-179 | Hardcoded | Keep hardcoded (methodology-defined) |
| DQS formula weights | calc-mcp line 245 | 0.7/0.3 | Keep hardcoded (methodology-defined) |
| Materiality threshold | strategy-mcp line 575 | 3 | Parameterize (optional input, default 3) |
| Risk scan signals | strategy-mcp lines 817-890 | 6 hardcoded | Move to risk-intelligence-baseline.json |
| OCR fake confidence | exec-mcp line 786 | 0.85 + random*0.14 | Replace with real tesseract.js output |
| Render page size | exec-mcp line 761 | 612x792 | Replace with real PDF page dimensions |
| Rate limits | exec-orchestrator agent | Documented only | Enforce in exec-mcp.js |
| Pipeline stages | exec-mcp lines 171-223 | Simulated | Make real |

---

## 15. Testing Swarms

Testing Swarms use the swarm orchestration system (Workstream 4) to validate CarbonKit itself. Unlike the unit/integration tests in Workstream 6, these are **agent-driven end-to-end validation workflows** — real swarms executing real domain workflows against real (or fixture) data, then asserting outcomes. They run via the same `/carbon:swarm:run` command as production swarms.

### 15.1 Why Testing Swarms

| Problem | Traditional Tests | Testing Swarms |
|---------|-------------------|----------------|
| MCP tool works in isolation | Unit test asserts return value | Swarm runs full workflow across 3+ MCP servers, validates cross-server data flow |
| Agent prompt regressions | Not testable | Swarm re-runs known scenario, compares SHA-256 of structured outputs to golden baseline |
| Schema mapping accuracy | Assert individual field mapping | Swarm ingests sample ERP export through full pipeline, checks final tCO2e matches expected range |
| Swarm YAML correctness | Schema validates syntax | Swarm actually executes the workflow against fixture data, catches runtime DAG failures |
| Quality gate drift | Test gate function | Swarm runs a workflow with intentionally bad data, asserts gate blocks propagation |
| Cross-plugin coordination | Not feasible | Swarm orchestrates calc → exec → strategy in sequence, validates evidence chain |

### 15.2 Testing Swarm Workflows

All testing swarm YAML files live in `plugins/swarms/workflows/tests/`.

#### test-rapid-baseline.yaml

```yaml
swarm:
  name: test-rapid-baseline
  version: 1
  description: Validates spend-based baseline pipeline end-to-end
  type: test
  timeout: 300s  # 5 min hard limit for tests

fixtures:
  spend_file: test-fixtures/sample-spend-50rows.csv
  expected_total_tco2e: { min: 120.0, max: 180.0 }
  expected_row_count: 50
  expected_methods: [spend, average_quantity]

stages:
  - id: ingest
    depends_on: []
    agents:
      - agent: scope3-calculation/agents/spend-baseline-operator
        plugin: scope3-calculation
        task: "Ingest fixture spend file"
        tools: [calc.ingest, calc.db.set, calc.db.get]
        inputs: { file: "$fixtures.spend_file" }
        outputs: { job_id: "$.job_id" }

  - id: compute
    depends_on: [ingest]
    agents:
      - agent: scope3-calculation/agents/calculation-orchestrator
        plugin: scope3-calculation
        task: "Compute emissions from ingested data"
        tools: [calc.compute, calc.dqs_score, calc.fx_normalize]
        inputs: { job_id: "$stages.ingest.outputs.job_id" }
        outputs: { run_id: "$.run_id", total_tco2e: "$.total_emissions_tco2e" }

  - id: export
    depends_on: [compute]
    agents:
      - agent: scope3-calculation/agents/governance-controller
        plugin: scope3-calculation
        task: "Export results as CSV"
        tools: [calc.export]
        inputs: { run_id: "$stages.compute.outputs.run_id", format: "csv" }
        outputs: { csv_path: "$.path" }

assertions:
  - type: range
    target: "$stages.compute.outputs.total_tco2e"
    min: "$fixtures.expected_total_tco2e.min"
    max: "$fixtures.expected_total_tco2e.max"
  - type: row_count
    target: "$stages.export.outputs.csv_path"
    expected: "$fixtures.expected_row_count"
  - type: no_errors
    stages: [ingest, compute, export]
  - type: dqs_above
    target: "$stages.compute.outputs.run_id"
    min_dqs: 0.3
```

#### test-scope12-engines.yaml

```yaml
swarm:
  name: test-scope12-engines
  version: 1
  description: Validates Scope 1 + Scope 2 calculation engines
  type: test
  timeout: 240s

fixtures:
  scope1_sources:
    - { type: stationary_combustion, fuel: natural_gas, volume: 10000, unit: therms, expected_tco2e: { min: 52.0, max: 55.0 } }
    - { type: mobile_combustion, fuel: diesel, volume: 5000, unit: gallons, expected_tco2e: { min: 50.0, max: 52.0 } }
    - { type: process_emissions, process: cement_clinker, mass: 1000, unit: tonnes, expected_tco2e: { min: 500.0, max: 550.0 } }
    - { type: fugitive_emissions, gas: R-410A, mass: 10, unit: kg, expected_tco2e: { min: 20.0, max: 22.0 } }
  scope2_location:
    - { grid_region: ERCOT, kwh: 100000, expected_tco2e: { min: 38.0, max: 42.0 } }
  scope2_market:
    - { instrument: REC, kwh: 100000, ef_override: 0.0, expected_tco2e: { min: 0.0, max: 0.1 } }

stages:
  - id: scope1_calc
    depends_on: []
    agents:
      - agent: scope12-accounting/agents/scope1-engine-operator
        plugin: scope12-accounting
        task: "Calculate Scope 1 for all 4 source types"
        tools: [scope12.compute_scope1, scope12.db.set]
        inputs: { sources: "$fixtures.scope1_sources" }
        outputs: { results: "$.results[]", total: "$.total_tco2e" }

  - id: scope2_dual
    depends_on: []
    agents:
      - agent: scope12-accounting/agents/scope2-engine-operator
        plugin: scope12-accounting
        task: "Calculate Scope 2 location-based and market-based"
        tools: [scope12.compute_scope2_location, scope12.compute_scope2_market, scope12.db.set]
        inputs:
          location: "$fixtures.scope2_location"
          market: "$fixtures.scope2_market"
        outputs: { location_total: "$.location_tco2e", market_total: "$.market_tco2e" }

  - id: hard_gates
    depends_on: [scope1_calc, scope2_dual]
    gate: all_agents_succeed
    agents:
      - agent: scope12-accounting/agents/scope12-governance-auditor
        plugin: scope12-accounting
        task: "Run 4 hard gates on Scope 1 results"
        tools: [scope12.validate_gates]

assertions:
  - type: per_item_range
    target: "$stages.scope1_calc.outputs.results"
    field: tco2e
    ranges: "$fixtures.scope1_sources[*].expected_tco2e"
  - type: range
    target: "$stages.scope2_dual.outputs.location_total"
    min: 38.0
    max: 42.0
  - type: equals
    target: "$stages.scope2_dual.outputs.market_total"
    expected: 0.0
    tolerance: 0.1
  - type: gate_passed
    stage: hard_gates
```

#### test-connector-mappings.yaml

```yaml
swarm:
  name: test-connector-mappings
  version: 1
  description: Validates schema mappings for all pre-built connectors
  type: test
  timeout: 180s

fixtures:
  sources:
    - { mapping: sap-s4hana, file: test-fixtures/sap-spend-sample.csv, expected_rows: 25 }
    - { mapping: oracle-netsuite, file: test-fixtures/netsuite-po-sample.csv, expected_rows: 30 }
    - { mapping: quickbooks, file: test-fixtures/qb-expenses-sample.csv, expected_rows: 20 }
    - { mapping: coupa, file: test-fixtures/coupa-invoices-sample.csv, expected_rows: 15 }
    - { mapping: concur, file: test-fixtures/concur-travel-sample.csv, expected_rows: 10 }
    - { mapping: brex-ramp, file: test-fixtures/brex-transactions-sample.csv, expected_rows: 40 }
    - { mapping: generic-csv, file: test-fixtures/generic-spend-sample.csv, expected_rows: 50 }
    - { mapping: generic-excel, file: test-fixtures/generic-spend-sample.xlsx, expected_rows: 50 }

stages:
  - id: map_all
    depends_on: []
    parallel: true  # All mappings run concurrently
    agents:
      - agent: connectors/agents/schema-mapper
        plugin: connectors
        task: "Map each fixture through its connector and validate canonical output"
        tools: [connectors.map, connectors.validate, connectors.preview]
        inputs: { sources: "$fixtures.sources" }
        outputs: { results: "$.results[]" }

  - id: crosswalk_verify
    depends_on: [map_all]
    agents:
      - agent: connectors/agents/data-ingestion-orchestrator
        plugin: connectors
        task: "Verify NAICS crosswalk resolves for all mapped rows"
        tools: [connectors.classify, connectors.crosswalk_lookup]
        inputs: { mapped_data: "$stages.map_all.outputs.results" }
        outputs: { classification_rate: "$.naics_resolve_pct" }

  - id: ingest_check
    depends_on: [map_all]
    agents:
      - agent: scope3-calculation/agents/spend-baseline-operator
        plugin: scope3-calculation
        task: "Attempt calc.ingest on mapped output — verify schema compatibility"
        tools: [calc.ingest, calc.db.get]
        inputs: { canonical_data: "$stages.map_all.outputs.results[0]" }
        outputs: { job_id: "$.job_id" }

assertions:
  - type: per_item_field
    target: "$stages.map_all.outputs.results"
    required_fields: [vendor, amount, currency, category, date]
  - type: per_item_row_count
    target: "$stages.map_all.outputs.results"
    expected_counts: "$fixtures.sources[*].expected_rows"
  - type: above_threshold
    target: "$stages.crosswalk_verify.outputs.classification_rate"
    min: 0.90
  - type: no_errors
    stages: [map_all, crosswalk_verify, ingest_check]
```

#### test-swarm-self-healing.yaml

```yaml
swarm:
  name: test-swarm-self-healing
  version: 1
  description: Validates swarm recovery from injected failures
  type: test
  timeout: 300s

fixtures:
  spend_file: test-fixtures/sample-spend-50rows.csv

stages:
  - id: ingest
    depends_on: []
    agents:
      - agent: scope3-calculation/agents/spend-baseline-operator
        plugin: scope3-calculation
        task: "Ingest spend data"
        tools: [calc.ingest]
        inputs: { file: "$fixtures.spend_file" }
        outputs: { job_id: "$.job_id" }

  - id: compute_with_fault
    depends_on: [ingest]
    fault_injection:
      type: agent_timeout
      target: 0  # First agent in the list
      after: 5s  # Kill after 5s
    recovery:
      strategy: retry
      max_retries: 2
      backoff: exponential
    agents:
      - agent: scope3-calculation/agents/calculation-orchestrator
        plugin: scope3-calculation
        task: "Compute emissions (will be interrupted)"
        tools: [calc.compute]
        inputs: { job_id: "$stages.ingest.outputs.job_id" }
        outputs: { run_id: "$.run_id" }

  - id: verify_recovery
    depends_on: [compute_with_fault]
    agents:
      - agent: scope3-calculation/agents/traceability-auditor
        plugin: scope3-calculation
        task: "Verify compute completed despite fault injection"
        tools: [calc.db.get]
        inputs: { run_id: "$stages.compute_with_fault.outputs.run_id" }
        outputs: { status: "$.status" }

assertions:
  - type: equals
    target: "$stages.verify_recovery.outputs.status"
    expected: "completed"
  - type: recovery_triggered
    stage: compute_with_fault
    expected_retries: { min: 1, max: 2 }
  - type: no_data_corruption
    stages: [ingest, compute_with_fault]
    check: "row_count_preserved"
```

#### test-evidence-chain.yaml

```yaml
swarm:
  name: test-evidence-chain
  version: 1
  description: Validates cross-plugin evidence chain from strategy through execution
  type: test
  timeout: 360s

fixtures:
  assessment_name: "Test Corp CSRD 2025"
  spend_file: test-fixtures/sample-spend-50rows.csv

stages:
  - id: strategy_setup
    depends_on: []
    agents:
      - agent: scope3-strategy/agents/strategy-flow-orchestrator
        plugin: scope3-strategy
        task: "Create assessment and run DMA stage 1"
        tools: [strategy.create_assessment, strategy.set_iro, strategy.score_iro]
        inputs: { name: "$fixtures.assessment_name" }
        outputs: { assessment_id: "$.id" }

  - id: calc_baseline
    depends_on: [strategy_setup]
    agents:
      - agent: scope3-calculation/agents/spend-baseline-operator
        plugin: scope3-calculation
        task: "Run spend baseline"
        tools: [calc.ingest, calc.compute, calc.dqs_score]
        inputs: { file: "$fixtures.spend_file" }
        outputs: { run_id: "$.run_id", total_tco2e: "$.total_emissions_tco2e" }

  - id: exec_evidence
    depends_on: [calc_baseline]
    agents:
      - agent: scope3-execution/agents/execution-orchestrator
        plugin: scope3-execution
        task: "Create evidence pack from calculation results"
        tools: [exec.run_pipeline, exec.quality_gates, exec.maturity_score]
        inputs: { run_id: "$stages.calc_baseline.outputs.run_id" }
        outputs: { pipeline_id: "$.pipeline_id", quality_pass: "$.gates_passed" }

  - id: strategy_link
    depends_on: [strategy_setup, exec_evidence]
    agents:
      - agent: scope3-strategy/agents/evidence-governance-operator
        plugin: scope3-strategy
        task: "Link execution evidence back to strategy assessment"
        tools: [strategy.add_evidence, strategy.db.get]
        inputs:
          assessment_id: "$stages.strategy_setup.outputs.assessment_id"
          pipeline_id: "$stages.exec_evidence.outputs.pipeline_id"
        outputs: { evidence_count: "$.evidence_count" }

assertions:
  - type: above_threshold
    target: "$stages.strategy_link.outputs.evidence_count"
    min: 1
  - type: equals
    target: "$stages.exec_evidence.outputs.quality_pass"
    expected: true
  - type: cross_reference
    source_stage: calc_baseline
    target_stage: strategy_link
    check: "run_id appears in evidence record"
  - type: no_orphans
    description: "Every calc output has a linked evidence record"
    stages: [calc_baseline, exec_evidence, strategy_link]
```

#### test-quality-gate-rejection.yaml

```yaml
swarm:
  name: test-quality-gate-rejection
  version: 1
  description: Validates that quality gates correctly block bad data
  type: test
  timeout: 180s

fixtures:
  bad_spend_file: test-fixtures/bad-spend-missing-fields.csv
  bad_dqs_threshold: 0.9  # Impossibly high

stages:
  - id: ingest_bad
    depends_on: []
    agents:
      - agent: scope3-calculation/agents/spend-baseline-operator
        plugin: scope3-calculation
        task: "Ingest intentionally bad data"
        tools: [calc.ingest]
        inputs: { file: "$fixtures.bad_spend_file" }
        outputs: { job_id: "$.job_id" }

  - id: compute_bad
    depends_on: [ingest_bad]
    agents:
      - agent: scope3-calculation/agents/calculation-orchestrator
        plugin: scope3-calculation
        task: "Compute on bad data — expect low DQS"
        tools: [calc.compute, calc.dqs_score]
        inputs: { job_id: "$stages.ingest_bad.outputs.job_id" }
        outputs: { run_id: "$.run_id", dqs: "$.dqs_score" }

  - id: gate_check
    depends_on: [compute_bad]
    gate: all_agents_succeed
    expect_failure: true  # This stage SHOULD fail
    agents:
      - agent: scope3-execution/agents/evidence-integrity-operator
        plugin: scope3-execution
        task: "Run quality gates with high threshold"
        tools: [exec.quality_gates]
        inputs:
          run_id: "$stages.compute_bad.outputs.run_id"
          dqs_threshold: "$fixtures.bad_dqs_threshold"

assertions:
  - type: stage_failed
    stage: gate_check
    reason_contains: "dqs"
  - type: below_threshold
    target: "$stages.compute_bad.outputs.dqs"
    max: "$fixtures.bad_dqs_threshold"
  - type: pipeline_halted_at
    stage: gate_check
    description: "Export stage never executed"
```

### 15.3 Testing Swarm Assertion Types

| Assertion Type | Description | Parameters |
|----------------|-------------|------------|
| `range` | Value falls within min/max bounds | `target`, `min`, `max` |
| `equals` | Value equals expected (with optional tolerance) | `target`, `expected`, `tolerance?` |
| `above_threshold` | Value >= minimum | `target`, `min` |
| `below_threshold` | Value <= maximum | `target`, `max` |
| `no_errors` | All listed stages completed without errors | `stages[]` |
| `row_count` | CSV/output has expected number of rows | `target` (file path), `expected` |
| `per_item_range` | Each item in array falls within its expected range | `target`, `field`, `ranges[]` |
| `per_item_field` | Each item has required fields present and non-null | `target`, `required_fields[]` |
| `per_item_row_count` | Each mapped output has expected row count | `target`, `expected_counts[]` |
| `stage_failed` | Stage failed as expected (negative testing) | `stage`, `reason_contains?` |
| `gate_passed` | Gate stage passed | `stage` |
| `recovery_triggered` | Self-healing was invoked | `stage`, `expected_retries` |
| `no_data_corruption` | Row count and checksums preserved after recovery | `stages[]`, `check` |
| `cross_reference` | Output from one stage appears in another stage's records | `source_stage`, `target_stage`, `check` |
| `no_orphans` | All outputs have corresponding linked records | `stages[]` |
| `pipeline_halted_at` | Pipeline stopped at expected stage | `stage` |
| `dqs_above` | DQS score for a run exceeds minimum | `target` (run_id), `min_dqs` |
| `sha256_match` | Output matches golden baseline hash | `target`, `golden_hash` |

### 15.4 Test Fixture Files

```
test-fixtures/
  sample-spend-50rows.csv              # Clean fixture: 50 rows, 5 vendors, USD/EUR/GBP
  bad-spend-missing-fields.csv         # Bad fixture: missing vendor, null amounts, invalid currency
  sap-spend-sample.csv                 # SAP S/4HANA format export (25 rows)
  netsuite-po-sample.csv               # Oracle NetSuite purchase orders (30 rows)
  qb-expenses-sample.csv              # QuickBooks expense export (20 rows)
  coupa-invoices-sample.csv            # Coupa invoice format (15 rows)
  concur-travel-sample.csv             # Concur travel expense (10 rows, Cat 6/7)
  brex-transactions-sample.csv         # Brex card transactions with MCCs (40 rows)
  generic-spend-sample.csv             # Minimal CSV (50 rows)
  generic-spend-sample.xlsx            # Same data as Excel
  golden-baselines/
    rapid-baseline-output.sha256       # SHA-256 of expected rapid-baseline CSV export
    scope12-results.sha256             # SHA-256 of expected Scope 1/2 results
    connector-canonical.sha256         # SHA-256 of expected mapped canonical output
  emission-factors-test.json           # Small factor set (50 factors) for deterministic testing
  gwp-ar6-test.json                    # GWP values (AR6) for Scope 1 fugitive tests
  scope1-sources-test.json             # 4 source types with known expected tCO2e
  scope2-grids-test.json               # Grid region EFs for location-based tests
```

### 15.5 Testing Swarm Execution Modes

```bash
# Run a single testing swarm
/carbon:swarm:run tests/test-rapid-baseline.yaml

# Run all testing swarms (CI mode — fail-fast, no interactive prompts)
/carbon:swarm:run tests/ --mode ci --fail-fast --no-prompt

# Run with verbose output (debugging)
/carbon:swarm:run tests/test-connector-mappings.yaml --verbose

# Run with golden baseline comparison
/carbon:swarm:run tests/test-rapid-baseline.yaml --golden-compare

# Re-generate golden baselines after intentional changes
/carbon:swarm:run tests/test-rapid-baseline.yaml --update-golden
```

### 15.6 Testing Swarm CI Integration

Testing swarms integrate into the CI pipeline (Workstream 6) as a final validation stage:

```yaml
# Addition to .github/workflows/ci.yml
jobs:
  # ... existing unit test jobs ...

  test-swarms:
    needs: [test-calc, test-exec, test-strategy, test-scope12, test-connectors]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - name: Run testing swarms
        run: |
          node plugins/swarms/tools/swarm-mcp.js --run-tests \
            --fixtures plugins/test-fixtures/ \
            --workflows plugins/swarms/workflows/tests/ \
            --mode ci \
            --fail-fast \
            --timeout 600
      - name: Compare golden baselines
        run: |
          node plugins/swarms/tools/swarm-mcp.js --golden-compare \
            --baselines plugins/test-fixtures/golden-baselines/
      - name: Upload test artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: swarm-test-results
          path: .carbonkit/swarm-runs/tests/
```

### 15.7 Testing Swarm Coverage Matrix

| Testing Swarm | Plugins Touched | MCP Tools Exercised | Gap Coverage |
|---------------|-----------------|---------------------|-------------|
| test-rapid-baseline | calc | ingest, compute, dqs_score, fx_normalize, export | G3 (factor matching), G15 (CSV escaping), G22 (ingest lifecycle) |
| test-scope12-engines | scope12 | compute_scope1, compute_scope2_location, compute_scope2_market, validate_gates | G11 (Scope 1/2 runtime) |
| test-connector-mappings | connectors, calc | map, validate, preview, classify, crosswalk_lookup, ingest | G3 (multi-field matching), G4 (seed data), G14 (crosswalk accuracy) |
| test-swarm-self-healing | swarms, calc | swarm engine, ingest, compute | G18 (swarm recovery), G20 (idempotency) |
| test-evidence-chain | strategy, calc, exec | create_assessment, set_iro, score_iro, ingest, compute, run_pipeline, quality_gates, add_evidence | G2 (blob storage), G5 (pipeline), G12 (cross-plugin bridge) |
| test-quality-gate-rejection | calc, exec | ingest, compute, dqs_score, quality_gates | G5 (pipeline gates), G16 (negative testing) |

---

## Appendix E: Plugin Registry

### E.1 Plugin Index

| Plugin | Version | Primary Agent | Demo Focus | Key Slash Commands |
|--------|---------|---------------|------------|--------------------|
| `scope3-strategy` | `0.5.1` | `agents/strategy-flow-orchestrator.md` | DMA-first CSRD strategy, audit-ready materiality matrix, external risk scanning | `workflows:scope3-strategy:csrd-dma-first-precollection-guidance`, `workflows:scope3-strategy:dma-audit-ready-materiality-matrix-stakeholder`, `workflows:scope3-strategy:ai-external-risk-scan-regulatory-media-ngo` |
| `scope3-calculation` | `0.4.1` | `agents/calculation-orchestrator.md` | Spend baseline, finance-grade ledger rigor, deep-tech LCA physics modeling | `workflows:scope3-calculation:spend-rapid-baseline-screenshot`, `workflows:scope3-calculation:cfo-carbon-ledger-rigor`, `workflows:scope3-calculation:deep-tech-lca-physics-modeling` |
| `scope3-execution` | `0.4.1` | `agents/execution-orchestrator.md` | Public disclosure intelligence + OCR evidence, supplier maturity scorecards, Tier 2+ survey cascades | `workflows:scope3-execution:disclosure-screenshot-intel`, `workflows:scope3-execution:supplier-maturity-scorecards`, `workflows:scope3-execution:cascade-tier2-surveys` |
| `scope12-accounting` | `0.1.0` | `agents/scope12-accounting-orchestrator.md` | Scope 1/2 accounting + KPI normalization + audit-ready reporting | `workflows:scope12-accounting:scope1-calculate-ledger`, `workflows:scope12-accounting:scope2-calculate-location-market`, `workflows:scope12-accounting:publish-scope12-report-pack` |
| `quality-monitoring` | `0.1.0` | `agents/quality-monitoring-operator.md` | Quality gates, visual monitoring, human overrides, persistent quality memory | `workflows:quality-monitoring:run-quality-gates`, `workflows:quality-monitoring:run-visual-quality-monitoring`, `workflows:quality-monitoring:request-human-approval` |
| `sales-outreach` | `0.1.0` | `agents/sales-outreach-orchestrator.md` | Outreach workflows with approvals + call qualification | `workflows:sales-outreach:run-daily-revenue-cycle`, `workflows:sales-outreach:prepare-approval-batch`, `workflows:sales-outreach:launch-voice-qualification` |
| `growth-content` | `0.1.0` | `agents/growth-content-orchestrator.md` | Content briefs, campaign audits, meme batching | `workflows:growth-content:content-brief`, `workflows:growth-content:campaign-audit`, `workflows:growth-content:meme-ideation-batch` |
| `ai-engineering` | `0.1.0` | `agents/ai-engineering-orchestrator.md` | Training/serving/RAG workflows | `workflows:ai-engineering:train-or-finetune-stack`, `workflows:ai-engineering:run-serving-benchmark`, `workflows:ai-engineering:build-rag-stack` |

### E.2 Org Architecture

```
CEO (You)
 |
 +-- Chief of Staff (Claude)
      |
      +-- Engineering ----> ai-engineering         (50 skills)
      |                +--> quality-monitoring       (6 skills)
      |
      +-- Marketing ------> growth-content          (10 skills)
      |
      +-- Sales ----------> sales-outreach           (1 skill)
      |
      +-- ESG ------------> scope3-strategy          (7 domain skills)
                       +--> scope3-calculation       (12 domain skills)
                       +--> scope3-execution          (8 domain skills)
                       +--> scope12-accounting        (4 domain skills)
```

### E.3 Skill Counts by Category

| Plugin | Category | Skill Count | Skills |
|--------|----------|-------------|--------|
| **ai-engineering** | Training | 11 | accelerate, axolotl, deepspeed, flash-attention, llama-factory, megatron, peft, ray-train, torchtitan, trl, unsloth |
| | Serving | 4 | llama-cpp, sglang, tensorrt-llm, vllm |
| | Quantization | 4 | awq, bitsandbytes, gguf, gptq |
| | RAG / Vector | 6 | chroma, faiss, llamaindex, pinecone, qdrant, sentence-transformers |
| | Vision / Audio | 8 | audiocraft, blip-2, clip, gemini-imagegen, llava, segment-anything, stable-diffusion, whisper |
| | Agent Frameworks | 6 | agent-browser, agent-engineering-workflows, autogpt, crewai, dspy, langchain |
| | 3D / Creative | 6 | threejs-fundamentals, threejs-geometry, threejs-interaction, threejs-postprocessing, threejs-shaders, remotion-best-practices |
| | Utility | 5 | brainstorming, find-skills, frontend-design, rclone, skill-installer |
| **growth-content** | Strategy & Positioning | 3 | content-positioning-strategy, product-marketing-context, free-tool-strategy |
| | SEO & Schema | 2 | seo-programmatic-audit, schema-markup |
| | Campaigns & Ads | 3 | paid-social-campaigns, email-sequence, ab-test-setup |
| | Analytics & CRO | 2 | analytics-tracking, growth-cro-funnel |
| **quality-monitoring** | Evaluation | 2 | lm-eval, bigcode-eval |
| | Observability | 4 | langsmith, phoenix, wandb, mlflow |
| **sales-outreach** | Voice | 1 | retell-calls |
| **scope3-strategy** | Domain | 7 | ai-external-risk-scanning, csrd-dma-precollection-guidance, dma-audit-materiality-matrix, dma-stage1-lifecycle, esrs-sequencing, export-evidence-pack, regulatory-evidence-linkage |
| **scope3-calculation** | Domain | 12 | calculation-traceability, compute-method-hierarchy, deep-tech-lca-physics, dqs-traceability, factor-mapping, finance-carbon-ledger-rigor, hotspots-campaigns, ingest-client-server, ingest-normalization, overrides-adjustments-governance, replay-consistency, spend-rapid-baseline |
| **scope3-execution** | Domain | 8 | disclosure-screenshot-intel, ocr-provenance, pipeline-execution, quality-rate-limit-audit, reduce-measure-report, report-control-pack, supplier-maturity-scorecards, tier2-survey-cascade |
| **scope12-accounting** | Domain | 4 | kpi-normalization-rules, reporting-assurance-rules, scope1-method-rules, scope2-method-rules |

### E.4 Team Composition Map

From `teams/teams.json`:

| Team | Plugins | Daily Focus |
|------|---------|-------------|
| `esg-scope3` | scope3-strategy, scope3-calculation, scope3-execution | CSRD compliance, Scope 3 calculations, supplier engagement |
| `esg-scope12` | scope12-accounting | Scope 1/2 annual close, KPI normalization |
| `revops` | sales-outreach, quality-monitoring | Revenue cycle, outreach qualification, quality gates |
| `growth` | growth-content, ai-engineering | Content production, AI/ML engineering workflows |

### E.5 Compatibility Matrix

```
                  Plugins  Skills  Commands  Agents  MCP Servers  Hooks
Claude Code         Y        Y       Y        Y         Y          Y
Codex CLI           -        -       -        -         Y          -
Antigravity         -        -       -        -         Y          -
Cursor              -        -       -        -         Y          -
Windsurf            -        -       -        -         Y          -
Cline               -        -       -        -         Y          -
Continue.dev        -        -       -        -         Y          -
Aider               -        -       -        -         -          -
```

Only Claude Code gets the full plugin experience (skills, agents, commands, hooks). All other harnesses consume MCP servers from the scope3 family. General-purpose plugins (ai-engineering, growth-content, quality-monitoring, sales-outreach) use external MCP connectors defined in `.mcp.json`.

---

## Appendix F: Environment Variables & Connector Auth

### F.1 Platform Variables (CarbonKit Core)

Defined in Appendix C above. These control the CarbonKit runtime: database backend, blob storage, MCP transport, LLM provider, telemetry.

### F.2 Plugin Connector Variables

These are required by the Tier 2/3 plugins that connect to external MCP servers.

| Variable | Required For | Purpose |
|----------|-------------|---------|
| `MCP_ROOT` | ai-engineering, growth-content, sales-outreach | Base path to external MCP servers checkout. Required when using `.mcp.json` connectors. |
| `GOOGLE_API_KEY` | ai-engineering, growth-content | Maps to `GEMINI_API_KEY` for nano-banana image MCP and Gemini models. |
| `OPENAI_API_KEY` | ai-engineering | OpenAI model access for training/serving benchmarks. |
| `ANTHROPIC_API_KEY` | ai-engineering | Anthropic model access. |
| `HF_TOKEN` | ai-engineering | Hugging Face Hub access for model downloads and dataset access. |
| `WANDB_API_KEY` | ai-engineering, quality-monitoring | Weights & Biases experiment tracking. |
| `LANGSMITH_API_KEY` | ai-engineering, quality-monitoring | LangSmith tracing and evaluation. |
| `PINECONE_API_KEY` | ai-engineering | Pinecone vector database for RAG workflows. |
| `MLFLOW_TRACKING_URI` | ai-engineering, quality-monitoring | MLflow experiment server endpoint. |
| `RETELL_API_KEY` | sales-outreach | Auth for Retell voice AI MCP server. |
| `RETELL_FROM_NUMBER` | sales-outreach | Outbound caller ID for voice qualification. |
| `RETELL_AGENT_ID` | sales-outreach | Retell agent configuration ID. |
| `HUNTER_API_KEY` | sales-outreach | Hunter.io email lookup for lead enrichment. |
| `APOLLO_API_KEY` | sales-outreach | Apollo.io for prospecting and enrichment. |
| `GMAIL_CREDENTIALS_PATH` | sales-outreach | Path to Gmail OAuth credentials JSON. |
| `DEEPGRAM_API_KEY` | growth-content | Deepgram speech-to-text for content transcription. |
| `ZAPIER_MCP_API_KEY` | growth-content | Zapier MCP for workflow automation hooks. |

**Note:** The Scope plugins (`scope3-*`, `scope12-accounting`) are self-contained — no external API keys needed.

### F.3 Hunter.io Retry Tuning

| Variable | Default | Purpose |
|----------|---------|---------|
| `HUNTER_RETRY_MAX_ATTEMPTS` | 3 | Max retry attempts on transient failures |
| `HUNTER_RETRY_INITIAL_DELAY` | 1000 | Initial delay in ms |
| `HUNTER_RETRY_MAX_DELAY` | 30000 | Max delay in ms |
| `HUNTER_RETRY_BACKOFF_FACTOR` | 2 | Exponential backoff multiplier |

### F.4 Connector Auth Details

#### Retell Voice AI
- Source: `${MCP_ROOT}/retell-mcp-server/index.js`
- Hard requirement: `RETELL_API_KEY`
- Also needs: `RETELL_FROM_NUMBER`, `RETELL_AGENT_ID`

#### Hunter.io
- Source: `${MCP_ROOT}/hunter-io-mcp-server/README.md`
- Hard requirement: `HUNTER_API_KEY`
- Supports retry tuning (see F.3)

#### Nano Banana (Gemini Image)
- Source: `${MCP_ROOT}/nano-banana-mcp-server/README.md`
- Hard requirement: `GEMINI_API_KEY` (wired from `GOOGLE_API_KEY`)


### F.5 Setup Checklist (New Developer)

1. **Prerequisites**: Node.js 18+, Python 3.10+, jq
2. **Clone**: `git clone` the plugins repo
3. **MCP root**: If using external connectors, set `MCP_ROOT` to your MCP servers checkout
4. **Env file**: Create `.env.plugins.local` (gitignored):
```bash
export MCP_ROOT=/absolute/path/to/mcp
export GOOGLE_API_KEY=your_google_key
export RETELL_API_KEY=your_retell_key
export HUNTER_API_KEY=your_hunter_key
```
5. **Load env**:
```bash
set -a; source .env.plugins.local; set +a
```
6. **Validate**:
```bash
python3 scripts/validate_bundle.py --mcp-selftest
```
7. **Verify plugin load** (Claude Code only):
```bash
claude plugin list
```

### F.6 Scope Plugin Self-Test

Scope plugins need no API keys. Verify they work standalone:

```bash
# Smoke-test each MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' | \
  node scope3-calculation/tools/calc-mcp.js

echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' | \
  node scope3-execution/tools/exec-mcp.js

echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' | \
  node scope3-strategy/tools/strategy-mcp.js
```
