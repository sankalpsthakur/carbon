---
name: Strategy Frontend Triggers
description: Maps natural language user intents to CarbonKit strategy slash commands
---

# Strategy Intent Router

When the user describes an action that matches a strategy frontend workflow, invoke the corresponding slash command.

## Intent Map

| User Says | Slash Command | Example |
|---|---|---|
| "create assessment", "start DMA", "new materiality assessment" | `/carbon:strategy:create-assessment` | Create a DMA assessment for 2024 |
| "add IRO", "list IROs", "impacts risks opportunities" | `/carbon:strategy:list-iros` | List all IROs for this assessment |
| "score materiality", "rate IRO", "score impact" | `/carbon:strategy:score-iro` | Score climate change IRO as material |
| "add evidence", "stakeholder evidence", "attach stakeholder input" | `/carbon:strategy:add-evidence` | Add stakeholder evidence to water IRO |
| "generate matrix", "materiality matrix", "double materiality" | `/carbon:strategy:generate-matrix` | Generate the materiality matrix |
| "finalize", "snapshot", "lock assessment" | `/carbon:strategy:finalize` | Finalize and snapshot the assessment |
| "risk scan", "external risks", "regulatory scan", "media scan" | `/carbon:strategy:risk-scan` | Scan for regulatory and media risks |
| "upload dataset", "upload LCA", "upload volumes", "add data" | `/carbon:strategy:upload-dataset` | Upload LCA dataset for FY2024 |
| "create org", "add organization", "new company" | `/carbon:strategy:upload-dataset` | Create organization for reporting |
| "evidence pack", "export evidence", "download pack" | `/carbon:strategy:export-pack` | Export the evidence pack |
| "export iXBRL", "XBRL report", "digital filing" | `/carbon:strategy:export-pack` | Export iXBRL filing |
| "DMA precollection", "prepare DMA", "guidance" | `/carbon:strategy:dma-precollect` | Get DMA precollection guidance |
| "stage 1", "lifecycle evidence", "stage 1 snapshot" | `/carbon:strategy:dma-stage1` | Run Stage 1 lifecycle evidence snapshot |
| "ESRS sequence", "materiality sequence", "anomaly check" | `/carbon:strategy:esrs-sequence` | Compute ESRS materiality sequence |
| "integrity audit", "snapshot integrity", "verify hashes" | `/carbon:strategy:integrity-audit` | Audit snapshot integrity (SHA-256) |
| "run compute", "calculate LCA", "product footprint" | `/carbon:strategy:esrs-sequence` | Run compute for org products |
| "run materiality", "double materiality run" | `/carbon:strategy:dma-matrix` | Run full materiality assessment |
| "scope 3 data", "add scope 3", "upstream data" | `/carbon:strategy:upload-dataset` | Add Scope 3 upstream data |
| "biodiversity", "add biodiversity", "nature data" | `/carbon:strategy:upload-dataset` | Add biodiversity metrics |
| "scope 1/2 data", "add scope 1 2", "direct emissions" | `/carbon:strategy:upload-dataset` | Add Scope 1/2 emissions data |
| "run anomaly detection", "data anomalies" | `/carbon:strategy:integrity-audit` | Run anomaly detection on datasets |
| "show trends", "emissions trends", "year over year" | `/carbon:strategy:esrs-sequence` | Show emissions trends |
| "set targets", "add target", "reduction target" | `/carbon:strategy:esrs-sequence` | Set a 30% reduction target by 2030 |
| "audit events", "audit log", "who changed what" | `/carbon:strategy:integrity-audit` | Show strategy audit events |
| "invite member", "add user", "org member" | `/carbon:strategy:create-assessment` | Invite a team member to the org |
| "external sources", "connectors", "data sources" | `/carbon:strategy:dma-precollect` | List external data sources |
| "external documents", "fetched docs", "crawled reports" | `/carbon:strategy:risk-scan` | Show fetched external documents |
| "external alerts", "risk alerts", "new warnings" | `/carbon:strategy:risk-scan` | Show new external risk alerts |

## Workflow Chains

Complex user requests may chain multiple commands:

| User Says | Command Chain |
|---|---|
| "Run a full DMA assessment" | `/carbon:strategy:create-assessment` -> `/carbon:strategy:list-iros` -> `/carbon:strategy:score-iro` -> `/carbon:strategy:generate-matrix` -> `/carbon:strategy:finalize` |
| "Upload data and compute footprint" | `/carbon:strategy:upload-dataset` (LCA + volumes) -> `/carbon:strategy:esrs-sequence` |
| "Prepare audit-ready evidence" | `/carbon:strategy:integrity-audit` -> `/carbon:strategy:export-pack` |
| "Check for external risks" | `/carbon:strategy:risk-scan` -> `/carbon:strategy:dma-precollect` |
| "Full CSRD reporting flow" | `/carbon:strategy:create-assessment` -> `/carbon:strategy:dma-matrix` -> `/carbon:strategy:export-pack` |

## MCP Tools Used

| Tool | Purpose |
|---|---|
| `strategy.db.get` | Read orgs, products, datasets, IROs, assessments, snapshots, risks, trends, targets |
| `strategy.db.set` | Write orgs, products, datasets, IRO scores, evidence, targets |
| `strategy.db.delete` | Remove entities from store |
| `strategy.materiality_matrix` | Generate double materiality matrix from IRO scores |
| `strategy.esrs_sequence` | Compute ESRS materiality anomaly sequence |
| `strategy.risk_score` | Score individual IRO risk/opportunity |
| `strategy.snapshot` | Create finalized assessment snapshot with SHA-256 hash |
| `strategy.risk_scan` | Scan external sources (regulatory, media, NGO) for risks |
| `strategy.upload` | Upload LCA, volume, scope 3 datasets |
| `strategy.export` | Generate evidence packs, iXBRL filings |
