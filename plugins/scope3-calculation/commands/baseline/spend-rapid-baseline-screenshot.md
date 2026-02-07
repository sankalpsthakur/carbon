---
name: spend-rapid-baseline-screenshot
description: Produce a spend-first rapid baseline inventory screenshot packet with strict traceability and replay-safe controls.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Run a same-day baseline when quantity and supplier-primary data are partial, without relaxing audit controls.

Execution flow:
1. Ingest readiness checkpoint
- `GET /api/ingestion-jobs/{job_id}`
- `GET /api/ingestion-jobs/{job_id}/reconciliation`
- Block unless `status=DONE`.
- Record row-level missingness rates for spend, currency, quantity, and unit.

2. Factor readiness for spend-first mapping
- `POST /api/lca/factors/seed` (or `POST /api/lca/factors/import` for controlled libraries).
- `POST /api/lca/factors/search` with `mode=regex|semantic` to verify candidate quality on top vendors/categories.
- Confirm at least one spend-basis fallback factor exists.

3. Rapid baseline compute
- `POST /api/lca/compute` with `{ "job_id": "...", "refresh": true, "force": false }`
- Require:
  - `inventory_item_count > 0`
  - non-empty `methodology_counts`
  - `total_emissions_tco2e = total_emissions_kgco2e / 1000`

4. Baseline screenshot packet
- `GET /api/lca/summary?job_id=...`
- `GET /api/lca/hotspots?job_id=...&impact_basis=spend_total&pareto_cutoff=0.8&limit=50`
- `GET /api/lca/gaps?job_id=...&impact_basis=spend_total&max_dqs=0.6&limit=50`
- `GET /api/lca/inventory?job_id=...&sort=spend_desc&limit=200`

5. Replay stability snapshot
- Take `run_id` from summary.
- `GET /api/lca/summary/as-of?job_id=...&run_id=...`
- Verify current summary and as-of replay agree for that run scope.

Hard gates (must fail closed):
1. Mixed units gate
- Fail if any row has `calculation_method=average_quantity` with incompatible unit denominator and no valid conversion trace.
- Allowed fallback is `spend` only when trace method reason is explicit and mapping is still reconstructable.

2. FX gaps gate
- If `reporting_currency` is configured and compute returns `409 Missing FX rates to normalize spend`, stop.
- No partial baseline publication is allowed with unresolved FX pairs.

3. Sparse factors gate
- Fail if `mapped_factor_id` is missing for any row where method is not `none`.
- Fail if `methodology_counts.none / inventory_item_count > 0.05`.

4. Replay drift gate
- Fail if absolute delta between `/summary` and `/summary/as-of` totals for same `run_id` exceeds `1e-9` for either:
  - `total_emissions_kgco2e`
  - `total_spend_reporting` (when reporting currency is used)

Deliverable:
- Baseline screenshot packet containing:
  - top spend hotspots
  - low-DQS/high-impact gaps
  - method mix
  - explicit pass/fail result for all four hard gates.
