---
name: Execution Frontend Triggers
description: Maps natural language user intents to CarbonKit execution slash commands
---

# Execution Intent Router

When the user describes an action that matches an execution frontend workflow, invoke the corresponding slash command.

## Intent Map

| User Says | Slash Command | Example |
|---|---|---|
| "run pipeline", "seed data", "initialize pipeline" | `/carbon:exec:pipeline` | Run the execution pipeline |
| "show suppliers", "supplier list", "recommendations" | `/carbon:exec:suppliers --view table` | Show me the supplier recommendations |
| "heatmap", "intensity map", "carbon heatmap" | `/carbon:exec:suppliers --view heatmap` | Show the intensity heatmap |
| "filter suppliers", "high impact suppliers", "filter by category" | `/carbon:exec:filter-suppliers` | Show suppliers with impact > 5% |
| "deep dive", "supplier details", "drill into supplier" | `/carbon:exec:supplier-deep-dive --id <id>` | Deep dive into Norsk Hydro |
| "update engagement", "change status", "mark as in progress" | `/carbon:exec:update-engagement --id <id> --status <s>` | Mark ArcelorMittal as in_progress |
| "show engagements", "engagement list", "supplier status" | `/carbon:exec:engagements` | Show all supplier engagements |
| "engage supplier", "start engagement", "send request" | `/carbon:exec:engage --supplier <id>` | Start engagement with BASF |
| "measure baseline", "upstream inventory", "measure overview" | `/carbon:exec:measure --period last_12_months` | Show the measure baseline |
| "seed measure", "initialize measure" | `/carbon:exec:measure-seed` | Seed measure inputs |
| "upload PDF", "upload document", "add disclosure" | `/carbon:exec:upload-pdf` | Upload BASF sustainability report |
| "OCR this", "extract text", "run OCR" | `/carbon:exec:ocr --doc <id> --page <n>` | Run OCR on page 45 |
| "render page", "show PDF page", "display page" | `/carbon:exec:render-page --doc <id> --page <n>` | Render page 12 of the DHL report |
| "load blocks", "show text blocks", "OCR blocks" | `/carbon:exec:load-blocks --doc <id> --page <n>` | Load OCR blocks for page 88 |
| "save provenance", "link evidence", "attach proof" | `/carbon:exec:save-provenance` | Save provenance for tCO2e field |
| "view provenance", "show evidence chain" | `/carbon:exec:view-provenance --id <id>` | View provenance for this field |
| "delete provenance", "remove link" | `/carbon:exec:delete-provenance --id <id>` | Delete provenance record abc123 |
| "add evidence", "attach evidence", "evidence for field" | `/carbon:exec:add-evidence --entity <e> --field <f>` | Add evidence for supplier benchmark |
| "run quality scan", "check anomalies", "data quality" | `/carbon:exec:quality-audit` | Run anomaly scan |
| "show anomalies", "quality issues", "open anomalies" | `/carbon:exec:quality-anomalies` | Show open quality anomalies |
| "resolve anomaly", "fix issue", "mark resolved" | `/carbon:exec:quality-audit` | Resolve anomaly for missing provenance |
| "export CSRD", "CSRD E1-6", "European report" | `/carbon:exec:export-csrd` | Export CSRD E1-6 format |
| "export GHG", "GHG Protocol report" | `/carbon:exec:export-ghg` | Export GHG Protocol format |
| "export report", "export PDF", "generate report" | `/carbon:exec:export-pdf` | Export the full PDF report |
| "audit trail", "show audit", "recent events" | `/carbon:exec:audit-trail` | Show the audit trail |
| "maturity scorecards", "supplier maturity" | `/carbon:exec:maturity-scorecards` | Generate supplier maturity scorecards |
| "tier 2 surveys", "cascade survey", "supply chain survey" | `/carbon:exec:tier2-surveys` | Send tier 2 supplier surveys |
| "disclosure intel", "screenshot disclosure", "public reports" | `/carbon:exec:disclosure-intel` | Scan public disclosures |
| "verify readiness", "execution ready", "pipeline status" | `/carbon:exec:verify-readiness` | Check execution readiness |

## Workflow Chains

Complex user requests may chain multiple commands:

| User Says | Command Chain |
|---|---|
| "Upload this PDF and OCR page 45" | `/carbon:exec:upload-pdf` -> `/carbon:exec:render-page` -> `/carbon:exec:ocr` |
| "Show me the worst suppliers and start engaging" | `/carbon:exec:suppliers` -> `/carbon:exec:supplier-deep-dive` -> `/carbon:exec:engage` |
| "Generate the CSRD report" | `/carbon:exec:measure` -> `/carbon:exec:export-csrd` |
| "Check data quality and fix issues" | `/carbon:exec:quality-audit` -> `/carbon:exec:quality-anomalies` -> `/carbon:exec:add-evidence` |
| "Full reduce-measure-report cycle" | `/carbon:exec:pipeline` -> `/carbon:exec:measure` -> `/carbon:exec:export-pdf` |

## MCP Tools Used

| Tool | Purpose |
|---|---|
| `exec.db.get` | Read suppliers, engagements, documents, OCR blocks, provenance, anomalies, audit |
| `exec.db.set` | Write documents, page renders, OCR blocks, provenance, anomaly status |
| `exec.db.delete` | Delete provenance records |
| `exec.pipeline.run` | Run full 5-stage execution pipeline |
| `exec.pipeline.stage` | Run individual pipeline stage (seed, ingest, generate) |
| `exec.render_page` | Render PDF page to image |
| `exec.ocr` | Run Gemini Flash OCR on rendered page |
| `exec.upload_pdf` | Upload PDF to docstore |
| `exec.engagement.update` | Update supplier engagement status |
| `exec.quality_gates` | Run quality gate checks and anomaly scans |
| `exec.export` | Generate CSRD, GHG Protocol, PDF exports |
