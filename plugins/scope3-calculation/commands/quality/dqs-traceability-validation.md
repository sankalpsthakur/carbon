---
name: dqs-traceability-validation
description: Validate DQS scoring, trace payload completeness, and immutable replay behavior across run/summary endpoints.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Audit data-quality and traceability exactly against implementation.

DQS base score formula (`_compute_dqs`):
- Start at `1.0`.
- Subtract penalties:
  - `0.25 * vendor_missing_rate`
  - `0.25 * description_missing_rate`
  - `0.30 * spend_missing_rate`
  - `0.10 * currency_missing_rate`
  - `0.05 * quantity_missing_rate`
  - `0.05 * unit_missing_rate`
  - additional `0.10` if `currency_count > 1`
- Clamp to `[0, 1]`.

Method-quality scores (`_method_quality_score`):
- `supplier_primary=1.0`
- `average_quantity=0.8`
- `spend=0.6`
- `none=0.3`

Final DQS formula (compute and override recompute paths):
- `final_dqs = clamp(0.7 * base_score + 0.3 * method_score, 0, 1)`

Trace contract (`build_inventory_trace` + `build_mapping_trace`):
- Required trace sections:
  - `trace_version`
  - `mapping` (search mode/provider/dims, mapped factor snapshot, candidates, fallback, optional override)
  - `method` (calculation method, reason, supporting values)
  - `dqs` (base/method/final scores)
- Optional sections when applicable:
  - `fx`
  - `units`
  - `primary`
  - `adjustments` array (last 10 entries)

Run-level validation endpoints:
- `GET /api/lca/summary?job_id=...`
- `GET /api/lca/runs?job_id=...`
- `GET /api/lca/summary/as-of?job_id=...&run_id=...`
- `GET /api/lca/inventory/versions?job_id=...&ledger_key=...`

As-of invariance checks:
- `summary/as-of` must compute totals from `inventory_item_versions` where `event_type=compute` and `event_id=run_id`.
- Later adjustments/overrides must not mutate those compute snapshots.

Gate outcome:
- Fail if any inventory row lacks method/dqs/mapping trace details required to reconstruct emissions and score provenance.
