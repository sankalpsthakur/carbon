---
name: overrides-adjustments-governance
description: Enforces approval workflow for factor mapping overrides and controlled adjustment restatements with immutable versioning.
---
Use when:
- A user needs to change mapped factor decisions or restate emissions/DQS.

Override controls:
- Create via `POST /api/lca/overrides/create` (state=`pending`).
- Review via `POST /api/lca/overrides/review` with `approve|reject`.
- Only approved overrides mutate current inventory mapping.

Adjustment controls:
- Create via `POST /api/lca/adjustments/create`.
- Allowed restatement fields: `emissions_total_kgco2e`, `dqs`.
- Disallowed in this endpoint: `mapped_factor_id`, `calculation_method`.

Audit guarantees:
- Overrides append `event_type=override` snapshots.
- Adjustments append `event_type=adjustment` snapshots.
- Latest adjustment per ledger key is applied to current view and reflected in trace adjustments history.

Period lock:
- `POST /api/lca/period/close` sets closed period metadata.
- Recompute blocked unless `/api/lca/compute` is called with `force=true`.
