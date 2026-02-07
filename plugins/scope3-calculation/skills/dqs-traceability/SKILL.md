---
name: dqs-traceability
description: Validates score mathematics, trace payload schema, and immutable replay lineage across compute and post-compute control actions.
---
Use when:
- Auditing whether reported results are reproducible and finance-ready.

DQS base formula:
- Start at `1.0`, subtract weighted missingness and multi-currency penalty, clamp to `[0,1]`.

Trace schema checkpoints:
- `trace_version`
- `mapping`: provider/store context, mapped factor snapshot, candidates, fallback, override info
- `method`: method name, reason, emissions inputs
- `dqs`: base, method, final
- optional: `fx`, `units`, `primary`, `adjustments`

Replay checks:
- Run pointer: `/api/lca/summary`
- History: `/api/lca/runs`
- Immutable replay: `/api/lca/summary/as-of`
- Version lineage: `/api/lca/inventory/versions`

Failure conditions:
- Missing trace sections that prevent row-level reconstruction.
- As-of replay totals changing due to later adjustments or overrides.
