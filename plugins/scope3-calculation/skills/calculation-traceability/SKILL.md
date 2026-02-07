---
name: calculation-traceability
description: Maintains row-level and run-level traceability from factor mapping and method selection through immutable replay summaries.
---
Use when:
- Building audit evidence for computed Scope 3 outputs.

Trace layers:
1. Row trace (`inventory_items.trace`)
- mapping, method, dqs and optional fx/units/primary/adjustments.

2. Run trace
- latest pointer: `lca_runs`
- append-only history: `lca_run_history`

3. Immutable version trace
- `inventory_item_versions` with event types: `compute`, `primary_upgrade`, `adjustment`, `override`, `legacy_snapshot`.

Replay and evidence endpoints:
- `GET /api/lca/summary`
- `GET /api/lca/runs`
- `GET /api/lca/summary/as-of`
- `GET /api/lca/inventory/versions`

Evidence requirement:
- Any total must be reconstructable to exact method and mapped factor decision recorded at computation time.
