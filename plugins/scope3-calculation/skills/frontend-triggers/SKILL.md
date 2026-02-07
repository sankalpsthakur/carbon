---
name: Calculation Frontend Triggers
description: Maps natural language user intents to CarbonKit calculation slash commands
---

# Calculation Intent Router

When the user describes an action that matches a calculation frontend workflow, invoke the corresponding slash command.

## Intent Map

| User Says | Slash Command | Example |
|---|---|---|
| "upload spend data", "ingest CSV", "create job", "import file" | `/carbon:calc:ingest` | Upload a spend CSV for Q4 2024 |
| "download template", "CSV template", "sample file" | `/carbon:calc:template` | Download the spend template |
| "show summary", "emissions overview", "dashboard totals" | `/carbon:calc:summary` | Show me the emissions summary |
| "top emitters", "hotspots", "biggest categories", "worst vendors" | `/carbon:calc:hotspots` | What are the top emission hotspots? |
| "data gaps", "missing data", "quality issues", "unmatched rows" | `/carbon:calc:gaps` | Show me data quality gaps |
| "convert currency", "FX rate", "exchange rate" | `/carbon:calc:fx-rates` | Convert 10000 EUR to USD |
| "export results", "download CSV", "export intensity" | `/carbon:calc:export-intensity` | Export job results as CSV |
| "list jobs", "my calculations", "recent uploads" | `/carbon:calc:jobs` | Show all calculation jobs |
| "view job", "job details", "open job" | `/carbon:calc:job --id <id>` | Show details for job demo-001 |
| "search factors", "find emission factor", "factor lookup" | `/carbon:calc:factors` | Search for steel emission factors |
| "run compute", "calculate emissions", "method hierarchy" | `/carbon:calc:compute` | Compute emissions for this job |
| "override factor", "adjust factor", "custom factor" | `/carbon:calc:overrides` | Override the steel factor to 2.1 kgCO2e/kg |
| "lock period", "close period", "freeze data" | `/carbon:calc:period-lock` | Lock the Q4 2024 period |
| "rapid baseline", "quick estimate", "baseline run" | `/carbon:calc:baseline` | Run a rapid spend baseline |
| "refresh summary", "recalculate", "replay" | `/carbon:calc:refresh` | Refresh the emissions summary |
| "ledger audit", "reconcile", "finance check" | `/carbon:calc:ledger-audit` | Run a CFO carbon ledger audit |
| "LCA model", "physics model", "process LCA" | `/carbon:calc:lca-model` | Run deep-tech LCA modeling |
| "DQS check", "traceability", "data quality score" | `/carbon:calc:dqs-validate` | Validate DQS traceability |
| "hotspot campaigns", "reduction campaigns", "generate campaigns" | `/carbon:calc:hotspot-campaigns` | Generate hotspot reduction campaigns |

## Workflow Chains

Complex user requests may chain multiple commands:

| User Says | Command Chain |
|---|---|
| "Upload this CSV and show me the summary" | `/carbon:calc:ingest` -> `/carbon:calc:compute` -> `/carbon:calc:summary` |
| "What's our carbon footprint?" | `/carbon:calc:jobs` -> `/carbon:calc:summary` -> `/carbon:calc:hotspots` |
| "Prepare the Q4 report" | `/carbon:calc:summary` -> `/carbon:calc:export-pdf` |
| "Check data quality for the latest job" | `/carbon:calc:jobs` -> `/carbon:calc:gaps` -> `/carbon:calc:dqs-validate` |

## MCP Tools Used

| Tool | Purpose |
|---|---|
| `calc.db.get` | Read jobs, factors, summary, hotspots, gaps, FX rates |
| `calc.db.set` | Write jobs, overrides, period locks |
| `calc.compute` | Run emission calculations with method hierarchy |
| `calc.ingest` | Upload and parse spend files |
| `calc.export` | Generate CSV, PDF exports |
| `calc.fx_normalize` | Currency conversion |
| `calc.dqs_score` | Data quality scoring |
