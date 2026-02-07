# CarbonKit SDK — Master Command Map

> Open-source Claude Code SDK for end-to-end Scope 1/2/3 decarbonisation workflows.
> Name: **CarbonKit**. Licensing: Apache-2.0.

---

## Critical Gap: MCP Servers Are Stubs

All 3 scope3 MCP servers (`strategy-mcp.js`, `calc-mcp.js`, `exec-mcp.js`) currently only expose:
- `*.health` — ping/version
- `*.sha256` — hash utility

**None of them implement actual DB get/set, calculations, or actions.** The entire SDK needs to be built on top of these stubs.

---

## Architecture: Frontend Button → SDK Command → MCP Tool

```
Frontend Button (onClick)
  ↓
API call (axios → /api/...)
  ↓
Backend endpoint (Flask/FastAPI)
  ↓
DB operation (MongoDB)

CarbonKit SDK replaces this with:

/carbon:<module>:<action> (slash command)
  ↓
MCP tool call (JSON-RPC 2.0)
  ↓
db.get / db.set / calculate / action
  ↓
Structured output (JSON + audit hash)
```

---

## SDK Primitive Operations

Every slash command resolves to one or more of these 6 primitives:

| Primitive | Description | MCP Method |
|-----------|-------------|------------|
| `db.get` | Read entity/collection from store | `tools/call → *.db.get` |
| `db.set` | Write/update entity in store | `tools/call → *.db.set` |
| `db.delete` | Remove entity from store | `tools/call → *.db.delete` |
| `calculate` | Run emissions/factor computation | `tools/call → *.calculate` |
| `action` | Trigger pipeline/workflow step | `tools/call → *.action` |
| `export` | Generate audit-ready output | `tools/call → *.export` |

---

## Module 1: CALCULATION (`/carbon:calc:*`)

### From Frontend: scope3-calculation (8 pages)

| # | Frontend Button | Page | API Endpoint | SDK Command | Primitives |
|---|----------------|------|-------------|-------------|------------|
| 1 | **Upload & create job** | IngestPage | `POST /api/ingestion-jobs/upload` | `/carbon:calc:ingest` | `action.upload`, `db.set(job)` |
| 2 | **Download CSV Template** | IngestPage | (client-side blob) | `/carbon:calc:template` | `export.template` |
| 3 | **Select reporting currency** | IngestPage | (form param) | `/carbon:calc:ingest --currency USD` | (param of #1) |
| 4 | **View job details** | DashboardPage | `GET /api/ingestion-jobs` | `/carbon:calc:jobs` | `db.get(jobs)` |
| 5 | **Upload Spend Data** (empty state CTA) | DashboardPage | navigate → /ingest | `/carbon:calc:ingest` | (same as #1) |
| 6 | **Export PDF** (disabled) | DashboardPage | — | `/carbon:calc:export-pdf` | `export.pdf` |
| 7 | **View details** (data gaps link) | DashboardPage | `GET /api/lca/gaps?job_id=` | `/carbon:calc:gaps` | `db.get(gaps)` |
| 8 | **Job workspace** (click job row) | DashboardPage | navigate → /jobs/:id | `/carbon:calc:job --id <id>` | `db.get(job)` |
| 9 | — (auto-load summary) | DashboardPage | `GET /api/lca/summary?job_id=` | `/carbon:calc:summary` | `db.get(summary)` |
| 10 | — (auto-load hotspots) | DashboardPage | `GET /api/lca/hotspots?job_id=` | `/carbon:calc:hotspots` | `db.get(hotspots)` |
| 11 | — (auto-load FX rates) | DashboardPage | `GET /api/fx-rates` | `/carbon:calc:fx-rates` | `db.get(fx_rates)` |
| 12 | — (DataGrid export CSV) | DashboardPage | (client-side) | `/carbon:calc:export-intensity` | `export.csv` |

### From Plugin Commands: scope3-calculation (11 commands)

| # | Plugin Command | SDK Command | Primitives |
|---|---------------|-------------|------------|
| 13 | `spend-rapid-baseline-screenshot` | `/carbon:calc:baseline` | `action.ingest`, `calculate.spend`, `export.screenshot` |
| 14 | `compute-method-hierarchy` | `/carbon:calc:compute` | `calculate.method_hierarchy` (supplier_primary → avg_quantity → spend → none) |
| 15 | `refresh-summary-and-replay` | `/carbon:calc:refresh` | `calculate.replay`, `db.set(summary)` |
| 16 | `cfo-carbon-ledger-rigor` | `/carbon:calc:ledger-audit` | `db.get(inventory)`, `calculate.reconcile` |
| 17 | `deep-tech-lca-physics-modeling` | `/carbon:calc:lca-model` | `calculate.lca_physics` |
| 18 | `factor-index-search-governance` | `/carbon:calc:factors` | `db.get(factors)`, `db.set(factor_override)` |
| 19 | `hotspots-campaign-generation` | `/carbon:calc:hotspot-campaigns` | `db.get(hotspots)`, `action.generate_campaigns` |
| 20 | `client-server-ingest-flow` | `/carbon:calc:ingest-flow` | `action.ingest`, `db.set(job)` |
| 21 | `dqs-traceability-validation` | `/carbon:calc:dqs-validate` | `db.get(dqs)`, `calculate.traceability` |
| 22 | `overrides-adjustments-governance` | `/carbon:calc:overrides` | `db.get(overrides)`, `db.set(override)` |
| 23 | `closed-period-control` | `/carbon:calc:period-lock` | `db.set(period.closed_at)` |

---

## Module 2: EXECUTION (`/carbon:exec:*`)

### From Frontend: scope3-execution (9 pages, 7 modules)

| # | Frontend Button | Page/Module | API Endpoint | SDK Command | Primitives |
|---|----------------|-------------|-------------|-------------|------------|
| 24 | **Run pipeline** (auto on load) | ReduceDashboard | `POST /api/pipeline/run` | `/carbon:exec:pipeline` | `action.pipeline_run` (seeds → ingest → generate) |
| 25 | **Recommendations** toggle | ReduceDashboard | `GET /api/suppliers/filter` | `/carbon:exec:suppliers --view table` | `db.get(suppliers)` |
| 26 | **Intensity Heatmap** toggle | ReduceDashboard | `GET /api/suppliers/heatmap` | `/carbon:exec:suppliers --view heatmap` | `db.get(heatmap)` |
| 27 | **Filter** (category/rating/impact/reduction) | ReduceDashboard | `GET /api/suppliers/filter?params` | `/carbon:exec:filter-suppliers` | `db.get(suppliers, filters)` |
| 28 | **Clear All** filters | ReduceDashboard | (UI state reset) | — | — |
| 29 | **Supplier row click** → DeepDivePanel | ReduceDashboard | (open panel) | `/carbon:exec:supplier-deep-dive --id <id>` | `db.get(supplier)`, `db.get(recommendations)` |
| 30 | **Engagement status change** | ReduceDashboard, EngagePage | `PUT /api/engagements/:id` | `/carbon:exec:update-engagement --id <id> --status <s>` | `db.set(engagement)` |
| 31 | **Go to Engage** (from panel) | ReduceDashboard | navigate → /dashboard/engage | `/carbon:exec:engage --supplier <id>` | — |
| 32 | **Refresh** engagements | EngagePage | `GET /api/engagements` | `/carbon:exec:engagements` | `db.get(engagements)` |
| 33 | **Seed measure** (auto) | MeasurePage | `POST /api/measure/seed` | `/carbon:exec:measure-seed` | `action.seed_measure` |
| 34 | **Period toggle** (Last 12m / FY2024) | MeasurePage | `GET /api/measure/overview?period=` | `/carbon:exec:measure --period <p>` | `db.get(measure_overview)` |
| 35 | **Add evidence** button | MeasurePage | navigate → /evidence?params | `/carbon:exec:add-evidence --entity <e> --field <f>` | — |
| 36 | **Upload PDF** | EvidencePage | `POST /api/pipeline/docs/upload` | `/carbon:exec:upload-pdf` | `action.upload_pdf`, `db.set(doc)` |
| 37 | **Select document** | EvidencePage | (UI state) | `/carbon:exec:select-doc --id <id>` | `db.get(doc)` |
| 38 | **Render** page | EvidencePage | `POST /api/execution/render-and-store-page` | `/carbon:exec:render-page --doc <id> --page <n>` | `action.render`, `db.set(page_image)` |
| 39 | **OCR** | EvidencePage | `POST /api/execution/ocr` | `/carbon:exec:ocr --doc <id> --page <n>` | `action.ocr`, `db.set(ocr_blocks)` |
| 40 | **Load stored** page | EvidencePage | `GET /api/execution/document-pages` | `/carbon:exec:load-stored --doc <id>` | `db.get(stored_pages)` |
| 41 | **Load blocks** | EvidencePage | `GET /api/execution/ocr-blocks` | `/carbon:exec:load-blocks --doc <id> --page <n>` | `db.get(ocr_blocks)` |
| 42 | **Save** provenance | EvidencePage | `POST /api/execution/field-provenance` | `/carbon:exec:save-provenance` | `db.set(provenance)` |
| 43 | **View** provenance | EvidencePage | (renders page + blocks) | `/carbon:exec:view-provenance --id <id>` | `db.get(provenance)`, `action.render` |
| 44 | **Delete** provenance | EvidencePage | `DELETE /api/execution/field-provenance/:id` | `/carbon:exec:delete-provenance --id <id>` | `db.delete(provenance)` |
| 45 | **Refresh** provenance list | EvidencePage | `GET /api/execution/field-provenance` | `/carbon:exec:provenance --entity <e>` | `db.get(provenance_list)` |
| 46 | **CSRD E1-6** export | ReportPage | (toast only, stub) | `/carbon:exec:export-csrd` | `export.csrd_e1_6` |
| 47 | **GHG Protocol** export | ReportPage | (toast only, stub) | `/carbon:exec:export-ghg` | `export.ghg_protocol` |
| 48 | **Export PDF** report | ReportPage | (toast only, stub) | `/carbon:exec:export-pdf` | `export.report_pdf` |
| 49 | **Logout** | Dashboard | `POST /api/auth/logout` | `/carbon:auth:logout` | `action.logout` |

### From Plugin Commands: scope3-execution (9 commands)

| # | Plugin Command | SDK Command | Primitives |
|---|---------------|-------------|------------|
| 50 | `run-execution-pipeline` | `/carbon:exec:pipeline` | `action.pipeline_run` (5 stages) |
| 51 | `disclosure-screenshot-intel` | `/carbon:exec:disclosure-intel` | `action.screenshot`, `action.ocr`, `db.set(intel)` |
| 52 | `supplier-maturity-scorecards` | `/carbon:exec:maturity-scorecards` | `db.get(suppliers)`, `calculate.maturity_score` |
| 53 | `cascade-tier2-surveys` | `/carbon:exec:tier2-surveys` | `action.send_surveys`, `db.set(survey_responses)` |
| 54 | `run-ocr-pass` | `/carbon:exec:ocr-pass` | `action.ocr`, `db.set(ocr_blocks)` |
| 55 | `reduce-measure-report` | `/carbon:exec:reduce-measure-report` | `db.get(all)`, `export.report` |
| 56 | `verify-execution-readiness` | `/carbon:exec:verify-readiness` | `db.get(pipeline_state)`, `calculate.readiness` |
| 57 | `quality-rate-limit-audit-checks` | `/carbon:exec:quality-audit` | `db.get(audit_log)`, `calculate.quality_gates` |
| 58 | `period-lock-and-docstore-gates` | `/carbon:exec:period-lock` | `db.set(period.locked)`, `action.gate_check` |

---

## Module 3: STRATEGY (`/carbon:strategy:*`)

### From Plugin Commands: scope3-strategy (8 commands)

| # | Plugin Command | SDK Command | Primitives |
|---|---------------|-------------|------------|
| 59 | `csrd-dma-first-precollection-guidance` | `/carbon:strategy:dma-precollect` | `db.get(assessment)`, `action.guidance` |
| 60 | `dma-audit-ready-materiality-matrix-stakeholder` | `/carbon:strategy:dma-matrix` | `db.get(iros)`, `db.set(scores)`, `calculate.matrix`, `action.snapshot` |
| 61 | `stage1-lifecycle-evidence-snapshot` | `/carbon:strategy:dma-stage1` | `db.get(lifecycle)`, `export.snapshot` |
| 62 | `compute-materiality-anomaly-sequence` | `/carbon:strategy:esrs-sequence` | `calculate.materiality`, `db.get(anomalies)` |
| 63 | `export-and-evidence-pack-constraints` | `/carbon:strategy:export-pack` | `export.evidence_pack` |
| 64 | `snapshot-integrity-audit` | `/carbon:strategy:integrity-audit` | `db.get(snapshots)`, `calculate.sha256_verify` |
| 65 | `ai-external-risk-scan-regulatory-media-ngo` | `/carbon:strategy:risk-scan` | `action.web_scan`, `db.set(risks)` |
| 66 | `org-product-dataset-upload-flow` | `/carbon:strategy:upload-dataset` | `action.upload`, `db.set(dataset)` |

### Key API Endpoints (from strategy frontend api.js + mockData.js)

| # | API Endpoint | SDK Command | Primitives |
|---|-------------|-------------|------------|
| 67 | `POST /api/dma/assessments` | `/carbon:strategy:create-assessment` | `db.set(assessment)` |
| 68 | `GET /api/dma/iros` | `/carbon:strategy:list-iros` | `db.get(iros)` |
| 69 | `POST /api/dma/iros/:id/evidence` | `/carbon:strategy:add-evidence` | `db.set(evidence)` |
| 70 | `PUT /api/dma/iros/:id/score` | `/carbon:strategy:score-iro` | `db.set(score)` |
| 71 | `POST /api/dma/assessments/:id/matrix` | `/carbon:strategy:generate-matrix` | `calculate.matrix` |
| 72 | `POST /api/dma/assessments/:id/snapshot` | `/carbon:strategy:finalize` | `action.snapshot`, `export.sha256` |

---

## Module 4: SCOPE 1/2 (`/carbon:scope12:*`)

### From Plugin Commands: scope12-accounting (4 commands)

| # | Plugin Command | SDK Command | Primitives |
|---|---------------|-------------|------------|
| 73 | `scope1-calculate-ledger` | `/carbon:scope12:scope1-ledger` | `db.get(sources)`, `calculate.scope1` |
| 74 | `scope2-calculate-location-market` | `/carbon:scope12:scope2-calculate` | `db.get(energy)`, `calculate.scope2_location`, `calculate.scope2_market` |
| 75 | `publish-scope12-report-pack` | `/carbon:scope12:report-pack` | `export.scope12_report` |
| 76 | `kpi-normalization` | `/carbon:scope12:kpi-normalize` | `calculate.kpi_normalize` |

---

## MCP Tool Spec: What Each Server Needs

### calc-mcp.js — needs these tools added:

```js
const TOOLS = [
  // DB ops
  { name: "calc.db.get",    params: { collection, query, projection } },
  { name: "calc.db.set",    params: { collection, filter, update, upsert } },
  { name: "calc.db.delete", params: { collection, filter } },

  // Calculations
  { name: "calc.compute",          params: { job_id, refresh, force } },
  { name: "calc.method_hierarchy", params: { group_key, factor_candidates } },
  { name: "calc.fx_normalize",     params: { amount, from_currency, to_currency, as_of } },
  { name: "calc.dqs_score",        params: { inventory_items } },
  { name: "calc.traceability",     params: { run_id } },

  // Actions
  { name: "calc.ingest",           params: { file_path, reporting_currency } },
  { name: "calc.replay",           params: { job_id } },

  // Export
  { name: "calc.export",           params: { format, job_id } },  // csv, pdf
];
```

### exec-mcp.js — needs these tools added:

```js
const TOOLS = [
  // DB ops
  { name: "exec.db.get",    params: { collection, query, projection } },
  { name: "exec.db.set",    params: { collection, filter, update, upsert } },
  { name: "exec.db.delete", params: { collection, filter } },

  // Actions
  { name: "exec.pipeline.run",     params: { period } },
  { name: "exec.pipeline.stage",   params: { stage } },  // seed, ingest, generate
  { name: "exec.render_page",      params: { doc_id, page_number, zoom } },
  { name: "exec.ocr",              params: { doc_id, page_number } },
  { name: "exec.upload_pdf",       params: { file_path, title, company_id, category } },
  { name: "exec.engagement.update",params: { supplier_id, status } },
  { name: "exec.survey.send",      params: { supplier_ids, template } },

  // Calculations
  { name: "exec.maturity_score",   params: { supplier_id } },
  { name: "exec.quality_gates",    params: { run_id } },
  { name: "exec.readiness_check",  params: { period } },

  // Export
  { name: "exec.export",           params: { format, period } },  // csrd, ghg, pdf
];
```

### strategy-mcp.js — needs these tools added:

```js
const TOOLS = [
  // DB ops
  { name: "strategy.db.get",    params: { collection, query, projection } },
  { name: "strategy.db.set",    params: { collection, filter, update, upsert } },
  { name: "strategy.db.delete", params: { collection, filter } },

  // Calculations
  { name: "strategy.materiality_matrix", params: { assessment_id } },
  { name: "strategy.esrs_sequence",      params: { assessment_id } },
  { name: "strategy.risk_score",         params: { iro_id } },

  // Actions
  { name: "strategy.snapshot",    params: { assessment_id, finalize } },
  { name: "strategy.risk_scan",   params: { org_id, sources } },
  { name: "strategy.upload",      params: { file_path, org_id } },

  // Export
  { name: "strategy.export",     params: { format, assessment_id } },
];
```

---

## Complete Slash Command Index (76 commands)

### `/carbon:calc:*` (23 commands)
```
/carbon:calc:ingest              Upload spend CSV/XLSX and create ingestion job
/carbon:calc:template            Download CSV template
/carbon:calc:jobs                List recent ingestion jobs
/carbon:calc:job                 View single job details
/carbon:calc:summary             Get emissions summary for job
/carbon:calc:hotspots            Get top emitting vendors
/carbon:calc:gaps                Get data gaps for job
/carbon:calc:fx-rates            Get active FX rates
/carbon:calc:export-intensity    Export intensity data as CSV
/carbon:calc:export-pdf          Export dashboard as PDF
/carbon:calc:baseline            Run spend rapid baseline
/carbon:calc:compute             Run compute with method hierarchy
/carbon:calc:refresh             Refresh summary and replay
/carbon:calc:ledger-audit        CFO carbon ledger rigor check
/carbon:calc:lca-model           Deep-tech LCA physics modeling
/carbon:calc:factors             Factor index search + governance
/carbon:calc:hotspot-campaigns   Generate hotspot reduction campaigns
/carbon:calc:ingest-flow         Client-server ingest flow
/carbon:calc:dqs-validate        DQS traceability validation
/carbon:calc:overrides           Overrides + adjustments governance
/carbon:calc:period-lock         Lock/unlock reporting period
/carbon:calc:onboard             Onboarding wizard
/carbon:calc:audit               View audit trail
```

### `/carbon:exec:*` (35 commands)
```
/carbon:exec:pipeline            Run full execution pipeline
/carbon:exec:suppliers           List/filter suppliers (table or heatmap)
/carbon:exec:filter-suppliers    Filter by category/rating/impact/reduction
/carbon:exec:supplier-deep-dive  Open deep-dive panel for supplier
/carbon:exec:update-engagement   Update engagement status
/carbon:exec:engagements         List all engagements
/carbon:exec:engage              Go to engage module for supplier
/carbon:exec:measure-seed        Seed measure baseline
/carbon:exec:measure             Get measure overview for period
/carbon:exec:add-evidence        Navigate to evidence for entity/field
/carbon:exec:upload-pdf          Upload PDF to docstore
/carbon:exec:select-doc          Select document from library
/carbon:exec:render-page         Render PDF page to image
/carbon:exec:ocr                 Run OCR on rendered page
/carbon:exec:ocr-pass            Full OCR pass (render → OCR → store)
/carbon:exec:load-stored         Load stored page render
/carbon:exec:load-blocks         Load OCR blocks for page
/carbon:exec:save-provenance     Link OCR blocks to entity field
/carbon:exec:view-provenance     View provenance (navigate to page)
/carbon:exec:delete-provenance   Delete provenance record
/carbon:exec:provenance          List provenance for entity
/carbon:exec:export-csrd         Export CSRD E1-6 format
/carbon:exec:export-ghg          Export GHG Protocol format
/carbon:exec:export-pdf          Export full report PDF
/carbon:exec:disclosure-intel    Screenshot + OCR public disclosures
/carbon:exec:maturity-scorecards Generate supplier maturity scorecards
/carbon:exec:tier2-surveys       Cascade Tier 2+ surveys
/carbon:exec:reduce-measure-report Full reduce-measure-report cycle
/carbon:exec:verify-readiness    Verify execution readiness
/carbon:exec:quality-audit       Quality + rate-limit audit checks
/carbon:exec:period-lock         Period lock + docstore gates
/carbon:exec:logout              Logout
/carbon:exec:quality-anomalies   View quality anomalies
/carbon:exec:audit-trail         View admin audit events
/carbon:exec:integrations        View/manage integrations
```

### `/carbon:strategy:*` (14 commands)
```
/carbon:strategy:dma-precollect     CSRD DMA first precollection guidance
/carbon:strategy:dma-matrix         Audit-ready materiality matrix
/carbon:strategy:dma-stage1         Stage 1 lifecycle evidence snapshot
/carbon:strategy:esrs-sequence      ESRS materiality anomaly sequence
/carbon:strategy:export-pack        Export evidence pack
/carbon:strategy:integrity-audit    Snapshot integrity audit
/carbon:strategy:risk-scan          AI external risk scan (regulatory/media/NGO)
/carbon:strategy:upload-dataset     Upload org/product dataset
/carbon:strategy:create-assessment  Create DMA assessment
/carbon:strategy:list-iros          List IROs
/carbon:strategy:add-evidence       Add stakeholder evidence to IRO
/carbon:strategy:score-iro          Score IRO (impact + financial materiality)
/carbon:strategy:generate-matrix    Generate materiality matrix
/carbon:strategy:finalize           Finalize assessment snapshot
```

### `/carbon:scope12:*` (4 commands)
```
/carbon:scope12:scope1-ledger    Calculate Scope 1 emissions ledger
/carbon:scope12:scope2-calculate Scope 2 location + market method
/carbon:scope12:report-pack      Publish Scope 1/2 report pack
/carbon:scope12:kpi-normalize    KPI normalization rules
```

---

## Data Model (entities the SDK manages)

| Entity | Collection | Key Fields | Module |
|--------|-----------|------------|--------|
| `job` | `ingestion_jobs` | id, filename, status, row_count, reporting_currency | calc |
| `inventory_item` | `inventory_items` | job_id, vendor, description, spend, emissions_total_kgco2e, method | calc |
| `factor` | `emission_factors` | id, basis, kgco2e_per_unit, source, year, region | calc |
| `override` | `overrides` | ledger_key, factor_id, approved_by | calc |
| `fx_rate` | `fx_rates` | base_currency, quote_currency, rate, as_of | calc |
| `lca_run` | `lca_runs` | run_id, job_id, total_emissions_kgco2e, methodology_counts | calc |
| `supplier` | `suppliers` | id, supplier_name, category, cee_rating, upstream_impact_pct | exec |
| `engagement` | `engagements` | supplier_id, status, updated_at | exec |
| `recommendation` | `recommendations` | supplier_id, action, potential_reduction_pct | exec |
| `document` | `documents` | doc_id, title, url, company_id, category | exec |
| `page_render` | `document_pages` | id, doc_id, page_number, zoom, png_base64 | exec |
| `ocr_block` | `ocr_blocks` | id, doc_id, page_number, request_id, text, bbox | exec |
| `provenance` | `field_provenance` | id, entity_type, entity_id, field_key, doc_id, ocr_block_ids | exec |
| `anomaly` | `quality_anomalies` | id, status, severity | exec |
| `audit_event` | `audit_events` | id, action, meta, created_at | exec |
| `assessment` | `dma_assessments` | id, org_id, year, finalized | strategy |
| `iro` | `iros` | id, assessment_id, type, topic, title, scores | strategy |
| `evidence` | `iro_evidence` | id, iro_id, source, stakeholder_type | strategy |
| `matrix` | `materiality_matrices` | assessment_id, placements | strategy |
| `snapshot` | `assessment_snapshots` | snapshot_id, version, sha256 | strategy |
| `risk` | `external_risks` | id, org_id, source, severity | strategy |

---

## Existing Plugin Coverage vs. Frontend Gaps

| What | Plugins Have | Frontend Has | Gap |
|------|-------------|-------------|-----|
| Slash commands | 28 across 3 plugins | 76 button actions | **48 commands missing** |
| MCP tools | 6 (health + sha256 x3) | 40+ API endpoints | **All DB/calc/action tools missing** |
| Agents | 20 specialized agents | — | Good coverage |
| Skills | 31 domain skills | — | Good coverage |
| Hooks | 3 hooks.json files | — | Minimal |
| DB layer | None (stubs) | Full MongoDB CRUD | **Entire DB layer missing** |
| Calculations | Documented in commands | Backend server.py | **Need MCP wrappers** |

---

## Implementation Priority

### Phase 1: Core Primitives (ship fast)
1. `db.get` / `db.set` / `db.delete` on all 3 MCP servers
2. MongoDB connection pooling in each MCP server
3. Auth middleware (bearer token forwarding)

### Phase 2: Calculation Engine
4. `calc.compute` — method hierarchy (supplier_primary → avg_quantity → spend → none)
5. `calc.fx_normalize` — FX rate lookup + conversion
6. `calc.dqs_score` — data quality scoring

### Phase 3: Execution Pipeline
7. `exec.pipeline.run` — 5-stage pipeline orchestration
8. `exec.render_page` + `exec.ocr` — PDF → image → text
9. `exec.engagement.update` — supplier engagement CRUD

### Phase 4: Strategy & Exports
10. `strategy.materiality_matrix` — DMA matrix generation
11. `*.export` — CSRD E1-6, GHG Protocol, PDF reports
12. `strategy.risk_scan` — external intelligence

---

## CLI Surface Area (CarbonKit OSS)

```bash
carbonkit init                    # Scaffold plugin
carbonkit run <plugin>:<workflow> # Local execution
carbonkit validate                # Contracts, schemas, env
carbonkit pack                    # Bundle/share
carbonkit export                  # Audit bundle: inputs, outputs, hashes, provenance
```
