---
name: overrides-adjustments-governance
description: Enforce controlled override approvals and adjustment restatements with exact endpoint/state semantics.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Apply governance with strict separation between mapping overrides and financial restatements.

Override workflow (factor remapping only):
1. Create request
- `POST /api/lca/overrides/create`
- Required: `job_id`, `mapped_factor_id`, `reason`, `actor`, and (`ledger_key` or `vendor`)
- Validates factor exists in `factors`.
- New override state: `pending`.

2. Review request
- `POST /api/lca/overrides/review`
- Body: `{ "override_id": "...", "action": "approve|reject", "actor": "..." }`
- Only `pending` requests are reviewable (`409` otherwise).
- On `approve`, applies override to current inventory row via `_apply_factor_override_to_current_inventory`.

3. List requests
- `GET /api/lca/overrides?job_id=...&state=...&limit=...`

Adjustment workflow (restatements only):
1. Create adjustment
- `POST /api/lca/adjustments/create`
- Supports only `emissions_total_kgco2e` and/or `dqs` overrides.
- Explicitly rejects `mapped_factor_id` and `calculation_method` in this endpoint (`400`).
- Adjustment type resolves to:
  - `override_emissions` when emissions provided
  - `override_dqs` when only dqs provided

2. List adjustments
- `GET /api/lca/adjustments?job_id=...&limit=...`

Current-view mutation rules:
- Latest adjustment per `ledger_key` is applied to `inventory_items`.
- Adjustment metadata fields are populated: `adjustment_id`, `adjusted_at`, `adjustment_reason`, `adjustment_actor`.
- Trace is extended with `adjustments[]`, method reason may become `adjustment_override`, and DQS score updated.

Immutable audit rules:
- Adjustment events append snapshot with `event_type=adjustment`.
- Approved override application appends snapshot with `event_type=override`.
- Recompute re-applies latest adjustments post-refresh to maintain restated current view.

Period close control:
- `POST /api/lca/period/close`
- Blocks future recompute unless `force=true` is passed to `/api/lca/compute`.
