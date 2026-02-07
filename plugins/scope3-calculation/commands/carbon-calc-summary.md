---
name: carbon-calc-summary
description: Run compute and display emissions summary with methodology breakdown and DQS for a job.
allowed-tools:
  - calc.compute
  - calc.dqs_score
  - calc.db.get
  - calc.db.list
  - Read
  - Glob
---
Compute emissions and produce a full summary for a calculation job.

## Step 1: Run compute

Call `calc.compute` with the target `job_id`.
- Set `refresh: true` to force recomputation even if inventory already exists.
- Set `force: true` to allow compute on closed periods.

Review the compute result:
- `run_id`: unique identifier for this compute run
- `inventory_item_count`: number of line items computed
- `total_emissions_kgco2e` / `total_emissions_tco2e`: aggregate emissions
- `total_spend` / `total_spend_reporting`: spend totals
- `methodology_counts`: breakdown by method (supplier_primary, average_quantity, spend, none)

## Step 2: Score data quality

Call `calc.dqs_score` with the same `job_id`.

Report:
- `base_score`: data completeness (0-1)
- `method_score`: weighted methodology quality (0-1)
- `final_dqs`: combined score using `0.7 * base + 0.3 * method`
- `missing_rates`: per-field missing data percentages

## Step 3: Inventory detail

Use `calc.db.list` with `collection: "inventory_items"` and `query: { "job_id": "<job_id>" }` to list computed line items.

For each item display: vendor, item_description, method, emissions_total_kgco2e, spend_reporting, factor_id.

## Step 4: Run history

Use `calc.db.list` with `collection: "lca_run_history"` and `query: { "job_id": "<job_id>" }` to review past compute runs.

## Deliverable

Present a summary table with:
- Total emissions (kgCO2e and tCO2e)
- Methodology distribution pie/bar
- DQS score with breakdown
- Top emitters list
