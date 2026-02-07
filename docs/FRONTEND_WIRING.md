# CarbonKit Frontend Wiring Map

Maps every frontend button/action to its CarbonKit slash command and MCP tool chain.

---

## Calculation Module

Codebase: `scope3-calculation/frontend/src/pages/`

| Frontend Action | Page | API Call | Slash Command | MCP Tools | DB Collections |
|---|---|---|---|---|---|
| Upload & Create Job | IngestPage | `POST /api/ingestion-jobs/upload` | `/carbon:calc:ingest` | `calc.ingest`, `calc.db.set` | `ingestion_jobs`, `activity_rows` |
| Download CSV Template | IngestPage | (client-side blob) | `/carbon:calc:template` | `calc.export` | -- |
| Select Reporting Currency | IngestPage | (form param on upload) | `/carbon:calc:ingest --currency <c>` | (param of ingest) | `ingestion_jobs` |
| Upload Spend Data (empty CTA) | DashboardPage | navigate -> /ingest | `/carbon:calc:ingest` | `calc.ingest` | `ingestion_jobs` |
| View Job Details (click row) | DashboardPage | navigate -> /jobs/:id | `/carbon:calc:job --id <id>` | `calc.db.get` | `ingestion_jobs` |
| Export PDF (disabled stub) | DashboardPage | -- | `/carbon:calc:export-pdf` | `calc.export` | `lca_runs` |
| View Data Gaps (link) | DashboardPage | `GET /api/lca/gaps?job_id=` | `/carbon:calc:gaps` | `calc.db.get` | `inventory_items` |
| Auto-load Summary | DashboardPage | `GET /api/lca/summary?job_id=` | `/carbon:calc:summary` | `calc.db.get` | `lca_runs` |
| Auto-load Hotspots | DashboardPage | `GET /api/lca/hotspots?job_id=` | `/carbon:calc:hotspots` | `calc.db.get` | `inventory_items` |
| Auto-load FX Rates | DashboardPage | `GET /api/fx-rates` | `/carbon:calc:fx-rates` | `calc.db.get` | `fx_rates` |
| DataGrid Export CSV | DashboardPage | (client-side) | `/carbon:calc:export-intensity` | `calc.export` | `inventory_items` |
| Search Emission Factors | FactorsPage | `GET /api/emission-factors/search?q=` | `/carbon:calc:factors` | `calc.db.get` | `emission_factors` |
| Filter by Category | FactorsPage | (client-side filter) | `/carbon:calc:factors --category <c>` | `calc.db.get` | `emission_factors` |
| View Supplier Inventory | SuppliersPage | `GET /api/lca/hotspots?job_id=` | `/carbon:calc:hotspots` | `calc.db.get` | `inventory_items` |
| Engagement Campaigns Table | SuppliersPage | (hardcoded mock) | `/carbon:calc:hotspot-campaigns` | `calc.db.get` | `inventory_items` |
| Job Workspace (tabs) | JobPage | `GET /api/ingestion-jobs/:id` | `/carbon:calc:job --id <id>` | `calc.db.get` | `ingestion_jobs`, `inventory_items` |
| Compute Emissions | JobPage | `POST /api/compute/:id` | `/carbon:calc:compute` | `calc.compute` | `lca_runs`, `inventory_items` |
| Export Job CSV | JobPage | (client-side) | `/carbon:calc:export-intensity` | `calc.export` | `inventory_items` |
| Override Factor | JobPage | `PUT /api/overrides/:id` | `/carbon:calc:overrides` | `calc.db.set` | `overrides` |
| Period Lock | JobPage | `POST /api/period-lock` | `/carbon:calc:period-lock` | `calc.db.set` | `ingestion_jobs` |

---

## Execution Module

Codebase: `scope3-execution/frontend/src/pages/`

| Frontend Action | Page | API Call | Slash Command | MCP Tools | DB Collections |
|---|---|---|---|---|---|
| Run Pipeline (auto on load) | ReduceDashboard | `POST /api/pipeline/run` | `/carbon:exec:pipeline` | `exec.pipeline.run` | `suppliers`, `recommendations`, `engagements` |
| Recommendations View (table) | ReduceDashboard | `GET /api/suppliers/filter` | `/carbon:exec:suppliers --view table` | `exec.db.get` | `suppliers` |
| Intensity Heatmap View | ReduceDashboard | `GET /api/suppliers/heatmap` | `/carbon:exec:suppliers --view heatmap` | `exec.db.get` | `suppliers` |
| Filter (category/rating/impact/reduction) | ReduceDashboard | `GET /api/suppliers/filter?params` | `/carbon:exec:filter-suppliers` | `exec.db.get` | `suppliers` |
| Clear All Filters | ReduceDashboard | (UI state reset) | -- | -- | -- |
| Supplier Row Click -> DeepDive | ReduceDashboard | (open panel) | `/carbon:exec:supplier-deep-dive --id <id>` | `exec.db.get` | `suppliers`, `recommendations` |
| Engagement Status Change | ReduceDashboard | `PUT /api/engagements/:id` | `/carbon:exec:update-engagement --id <id> --status <s>` | `exec.engagement.update` | `engagements` |
| Go to Engage (from panel) | ReduceDashboard | navigate -> /engage | `/carbon:exec:engage --supplier <id>` | -- | -- |
| Load Supplier List | EngagePage | `GET /api/suppliers` | `/carbon:exec:suppliers` | `exec.db.get` | `suppliers` |
| Load Engagements | EngagePage | `GET /api/engagements` | `/carbon:exec:engagements` | `exec.db.get` | `engagements` |
| Update Engagement Status | EngagePage | `PUT /api/engagements/:id` | `/carbon:exec:update-engagement` | `exec.engagement.update` | `engagements` |
| Refresh Engagements | EngagePage | `GET /api/engagements` | `/carbon:exec:engagements` | `exec.db.get` | `engagements` |
| Seed Measure (auto) | MeasurePage | `POST /api/measure/seed` | `/carbon:exec:measure-seed` | `exec.pipeline.stage` | `measure_inputs` |
| Period Toggle (Last 12m / FY2024) | MeasurePage | `GET /api/measure/overview?period=` | `/carbon:exec:measure --period <p>` | `exec.db.get` | `measure_inputs` |
| Add Evidence Button | MeasurePage | navigate -> /evidence?params | `/carbon:exec:add-evidence --entity <e> --field <f>` | -- | -- |
| Upload PDF | EvidencePage | `POST /api/pipeline/docs/upload` | `/carbon:exec:upload-pdf` | `exec.upload_pdf`, `exec.db.set` | `documents` |
| Select Document | EvidencePage | (UI state) | `/carbon:exec:select-doc --id <id>` | `exec.db.get` | `documents` |
| Render Page | EvidencePage | `POST /api/execution/render-and-store-page` | `/carbon:exec:render-page --doc <id> --page <n>` | `exec.render_page`, `exec.db.set` | `document_pages` |
| Run OCR | EvidencePage | `POST /api/execution/ocr` | `/carbon:exec:ocr --doc <id> --page <n>` | `exec.ocr`, `exec.db.set` | `ocr_blocks` |
| Load Stored Page | EvidencePage | `GET /api/execution/document-pages` | `/carbon:exec:load-stored --doc <id>` | `exec.db.get` | `document_pages` |
| Load OCR Blocks | EvidencePage | `GET /api/execution/ocr-blocks` | `/carbon:exec:load-blocks --doc <id> --page <n>` | `exec.db.get` | `ocr_blocks` |
| Save Provenance | EvidencePage | `POST /api/execution/field-provenance` | `/carbon:exec:save-provenance` | `exec.db.set` | `field_provenance` |
| View Provenance | EvidencePage | (render page + load blocks) | `/carbon:exec:view-provenance --id <id>` | `exec.db.get`, `exec.render_page` | `field_provenance`, `document_pages` |
| Delete Provenance | EvidencePage | `DELETE /api/execution/field-provenance/:id` | `/carbon:exec:delete-provenance --id <id>` | `exec.db.delete` | `field_provenance` |
| Refresh Provenance List | EvidencePage | `GET /api/execution/field-provenance` | `/carbon:exec:provenance --entity <e>` | `exec.db.get` | `field_provenance` |
| Run Anomaly Scan | QualityPage | `POST /api/quality/anomalies/run` | `/carbon:exec:quality-audit` | `exec.quality_gates` | `quality_anomalies` |
| Filter Anomalies (status/severity) | QualityPage | `GET /api/quality/anomalies?status=&severity=` | `/carbon:exec:quality-anomalies` | `exec.db.get` | `quality_anomalies` |
| Resolve/Ignore Anomaly | QualityPage | `POST /api/quality/anomalies/:id/status` | `/carbon:exec:quality-audit` | `exec.db.set` | `quality_anomalies` |
| Open Evidence from Anomaly | QualityPage | navigate -> /evidence?params | `/carbon:exec:add-evidence` | -- | -- |
| CSRD E1-6 Export | ReportPage | (toast stub) | `/carbon:exec:export-csrd` | `exec.export` | `measure_inputs`, `suppliers` |
| GHG Protocol Export | ReportPage | (toast stub) | `/carbon:exec:export-ghg` | `exec.export` | `measure_inputs`, `suppliers` |
| Export PDF Report | ReportPage | (toast stub) | `/carbon:exec:export-pdf` | `exec.export` | `measure_inputs`, `engagements` |
| View Audit Trail | ReportPage | `GET /api/admin/audit` | `/carbon:exec:audit-trail` | `exec.db.get` | `audit_events` |

---

## Strategy Module

Codebase: `scope3-strategy/frontend/src/App.js` (monolithic single-file app)

Routes: `/dashboard`, `/stage1`, `/stakeholders`, `/org/:orgId`, `/agent`, `/risk-monitor`, `/connectors`, `/trends`, `/targets`, `/audit`

| Frontend Action | Page/Route | API Call | Slash Command | MCP Tools | DB Collections |
|---|---|---|---|---|---|
| Create Organization | /dashboard | `POST /api/orgs` | `/carbon:strategy:upload-dataset` | `strategy.db.set` | `orgs` |
| List Organizations | /dashboard | `GET /api/orgs` | `/carbon:strategy:list-iros` | `strategy.db.get` | `orgs` |
| Add Product | /org/:orgId | `POST /api/products` | `/carbon:strategy:upload-dataset` | `strategy.db.set` | `products` |
| Upload LCA Dataset | /org/:orgId | `POST /api/datasets/lca/upload` | `/carbon:strategy:upload-dataset` | `strategy.upload`, `strategy.db.set` | `datasets_lca` |
| Upload Volume Dataset | /org/:orgId | `POST /api/datasets/volumes/upload` | `/carbon:strategy:upload-dataset` | `strategy.upload`, `strategy.db.set` | `datasets_volumes` |
| Run Compute | /org/:orgId | `POST /api/compute/run` | `/carbon:strategy:esrs-sequence` | `strategy.materiality_matrix` | `lca_results` |
| Run Materiality | /org/:orgId | `POST /api/materiality/run` | `/carbon:strategy:dma-matrix` | `strategy.materiality_matrix` | `dma_assessments`, `materiality_matrices` |
| Load DMA Snapshots | /org/:orgId | `GET /api/dma/snapshots` | `/carbon:strategy:dma-stage1` | `strategy.db.get` | `assessment_snapshots` |
| Add Scope 3 Data | /org/:orgId | `POST /api/datasets/scope3` | `/carbon:strategy:upload-dataset` | `strategy.db.set` | `datasets_scope3` |
| Add Biodiversity Data | /org/:orgId | `POST /api/biodiversity` | `/carbon:strategy:upload-dataset` | `strategy.db.set` | `biodiversity` |
| Add Scope 1/2 Data | /org/:orgId | `POST /api/datasets/scope12` | `/carbon:strategy:upload-dataset` | `strategy.db.set` | `datasets_scope12` |
| Run Anomaly Detection | /org/:orgId | `POST /api/anomalies/run` | `/carbon:strategy:integrity-audit` | `strategy.db.get` | `anomalies` |
| Export Evidence Pack | /org/:orgId | `GET /api/export/evidence-pack` | `/carbon:strategy:export-pack` | `strategy.export` | `assessment_snapshots`, `iro_evidence` |
| Export iXBRL | /org/:orgId | `GET /api/export/ixbrl` | `/carbon:strategy:export-pack` | `strategy.export` | `lca_results`, `dma_assessments` |
| Invite Org Member | /org/:orgId | `POST /api/orgs/:id/members` | `/carbon:strategy:create-assessment` | `strategy.db.set` | `org_members` |
| Start DMA Assessment | /stage1 (Agent) | `POST /api/dma/assessments` | `/carbon:strategy:create-assessment` | `strategy.db.set` | `dma_assessments` |
| List IROs | /stage1 | `GET /api/dma/iros` | `/carbon:strategy:list-iros` | `strategy.db.get` | `iros` |
| Score IRO | /stage1 | `PUT /api/dma/iros/:id/score` | `/carbon:strategy:score-iro` | `strategy.db.set` | `iros` |
| Add Evidence to IRO | /stage1 | `POST /api/dma/iros/:id/evidence` | `/carbon:strategy:add-evidence` | `strategy.db.set` | `iro_evidence` |
| Generate Materiality Matrix | /stage1 | `POST /api/dma/assessments/:id/matrix` | `/carbon:strategy:generate-matrix` | `strategy.materiality_matrix` | `materiality_matrices` |
| Finalize Assessment Snapshot | /stage1 | `POST /api/dma/assessments/:id/snapshot` | `/carbon:strategy:finalize` | `strategy.snapshot` | `assessment_snapshots` |
| External Risk Monitor | /risk-monitor | `GET /api/external/sources` | `/carbon:strategy:risk-scan` | `strategy.risk_scan` | `external_risks` |
| Fetch External Documents | /risk-monitor | `GET /api/external/docs` | `/carbon:strategy:risk-scan` | `strategy.db.get` | `external_docs` |
| Fetch External Alerts | /risk-monitor | `GET /api/external/alerts` | `/carbon:strategy:risk-scan` | `strategy.db.get` | `external_alerts` |
| Ingest Run History | /connectors | `GET /api/external/ingest/runs` | `/carbon:strategy:dma-precollect` | `strategy.db.get` | `ingest_runs` |
| View Trends | /trends | `GET /api/trends` | `/carbon:strategy:esrs-sequence` | `strategy.db.get` | `trends` |
| Set Targets | /targets | `POST /api/targets` | `/carbon:strategy:esrs-sequence` | `strategy.db.set` | `targets` |
| List Targets | /targets | `GET /api/targets` | `/carbon:strategy:esrs-sequence` | `strategy.db.get` | `targets` |
| View Audit Events | /audit | `GET /api/audit/events` | `/carbon:strategy:integrity-audit` | `strategy.db.get` | `audit_events` |

---

## Cross-Module Navigation Flows

| From | To | Trigger | Slash Command Chain |
|---|---|---|---|
| DashboardPage (calc) | IngestPage | "Upload Spend Data" button | `/carbon:calc:ingest` |
| DashboardPage (calc) | JobPage | Click job row | `/carbon:calc:job --id <id>` |
| DashboardPage (calc) | JobPage | "View details" gaps link | `/carbon:calc:gaps` |
| ReduceDashboard | EngagePage | "Go to Engage" from DeepDive panel | `/carbon:exec:engage --supplier <id>` |
| MeasurePage | EvidencePage | "Add" evidence button per supplier | `/carbon:exec:add-evidence --entity <e> --field <f>` |
| QualityPage | EvidencePage | "Provenance" / "Evidence" anomaly fix | `/carbon:exec:add-evidence` |

---

## MCP Server to Collection Mapping

| MCP Server | Collections Owned |
|---|---|
| `calc-mcp.js` | `ingestion_jobs`, `activity_rows`, `inventory_items`, `emission_factors`, `overrides`, `fx_rates`, `lca_runs` |
| `exec-mcp.js` | `suppliers`, `recommendations`, `engagements`, `documents`, `document_pages`, `ocr_blocks`, `field_provenance`, `quality_anomalies`, `audit_events`, `measure_inputs` |
| `strategy-mcp.js` | `orgs`, `products`, `datasets_lca`, `datasets_volumes`, `datasets_scope3`, `datasets_scope12`, `biodiversity`, `dma_assessments`, `iros`, `iro_evidence`, `materiality_matrices`, `assessment_snapshots`, `external_risks`, `external_docs`, `external_alerts`, `trends`, `targets` |
