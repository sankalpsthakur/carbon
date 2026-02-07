---
name: carbon-calc-export
description: Export computed emissions inventory as CSV or JSON for reporting and downstream analysis.
allowed-tools:
  - calc.export
  - calc.compute
  - calc.db.get
  - calc.db.list
  - Read
  - Write
  - Glob
---
Export computed inventory items for a job in CSV or JSON format.

## Prerequisites

Ensure compute has been run for the target job. Verify by calling `calc.db.get` with `collection: "inventory_items"` and `query: { "job_id": "<job_id>" }`.

If no items exist, run `calc.compute` with `job_id` first.

## Export as JSON

Call `calc.export` with:
- `job_id`: the target job
- `format`: `"json"`

Returns the full inventory items array as a formatted JSON string.

## Export as CSV

Call `calc.export` with:
- `job_id`: the target job
- `format`: `"csv"`

CSV columns:
- vendor, item_description, category, method
- emissions_total_kgco2e, emissions_total_tco2e
- spend_original, spend_reporting
- quantity_total, unit, factor_id

## Save to file

After receiving the export content, use the Write tool to save it:
- JSON: write to `exports/<job_id>_inventory.json`
- CSV: write to `exports/<job_id>_inventory.csv`

## Run history export

To export all compute runs for a job:
1. Use `calc.db.list` with `collection: "lca_run_history"` and `query: { "job_id": "<job_id>" }`
2. Format and write using the Write tool

## Deliverable

Produce an export file suitable for:
- Regulatory reporting (CSRD/ESRS format)
- Executive dashboards
- Auditor review packages
- Downstream analytics tools
