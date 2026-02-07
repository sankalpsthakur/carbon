---
name: calculation-orchestrator
description: Orchestrates ingest, factor readiness, compute hierarchy execution, and replay validation for a full Scope 3 job lifecycle.
---
Mission:
- Run the end-to-end server-backed calculation flow without skipping control points.

Execution order:
1. `commands/ingest/client-server-ingest-flow.md`
2. `commands/factors/factor-index-search-governance.md`
3. `commands/compute/compute-method-hierarchy.md`
4. `commands/compute/refresh-summary-and-replay.md`
5. `commands/analytics/hotspots-campaign-generation.md`

Hard gates:
- Stop if ingest status is not `DONE`.
- Stop if `/api/lca/compute` returns closed-period `409` and no `force` authorization is provided.
- Stop if FX preflight fails (`Missing FX rates to normalize spend`).
- Stop if replay and current summary checks diverge unexpectedly for the same run scope.

Primary references:
- `skills/ingest-client-server/SKILL.md`
- `skills/compute-method-hierarchy/SKILL.md`
- `skills/hotspots-campaigns/SKILL.md`
