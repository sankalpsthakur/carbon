---
name: carbon-calc-gaps
description: Identify data quality gaps, missing fields, and methodology weaknesses in a calculation job.
allowed-tools:
  - calc.dqs_score
  - calc.db.get
  - calc.db.list
  - Read
  - Glob
---
Analyze data quality gaps and coverage issues for a calculation job.

## Step 1: Get job reconciliation

Use `calc.db.get` with `collection: "jobs"` and `query: { "_id": "<job_id>" }`.

Review the reconciliation block:
- `missing`: counts per flag (MISSING_VENDOR, MISSING_DESCRIPTION, MISSING_SPEND, etc.)
- `missing_pct`: percentage rates per flag
- `rows_with_any_flag` vs `rows_clean`
- `currencies` and `units` lists

## Step 2: Score data quality

Call `calc.dqs_score` with `job_id`.

Flag concerns when:
- `base_score` < 0.7 (significant data completeness issues)
- `method_score` < 0.7 (too many spend-based or none methods)
- `final_dqs` < 0.6 (overall quality risk)

## Step 3: Identify rows with flags

Use `calc.db.list` with `collection: "activity_rows"` and `query: { "job_id": "<job_id>" }`.

Filter for rows where `data_quality_flags` is non-empty. Group by flag type.

## Step 4: Methodology gaps

Use `calc.db.list` with `collection: "inventory_items"` and `query: { "job_id": "<job_id>" }`.

Identify items computed with `method: "none"` or `method: "spend"` that could be upgraded:
- Items with `method: "none"`: need emission factors or primary data
- Items with `method: "spend"`: could improve by adding quantity data and quantity-based factors
- Items with `method: "average_quantity"`: could improve by collecting supplier-specific primary data

## Step 5: Factor coverage

Use `calc.db.list` with `collection: "emission_factors"` to review available factors.
Compare against categories/descriptions in activity rows to identify unmapped items.

## Deliverable

Present a gap analysis report:
- Data completeness summary (base_score, per-field rates)
- Methodology upgrade opportunities with estimated DQS improvement
- Priority remediation list (highest-emission items with worst methods)
- Missing factor categories
