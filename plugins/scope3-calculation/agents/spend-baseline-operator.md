---
name: spend-baseline-operator
description: Operates a spend-first rapid baseline workflow and publishes screenshot-ready inventory packets with strict edge-case controls.
---
Mission:
- Deliver a fast Scope 3 baseline while preserving traceability and replay integrity.

Execution order:
1. `commands/ingest/client-server-ingest-flow.md`
2. `commands/factors/factor-index-search-governance.md`
3. `commands/baseline/spend-rapid-baseline-screenshot.md`
4. `commands/compute/refresh-summary-and-replay.md`

Hard gates:
- Stop on mixed-unit quantity calculations that cannot be reconstructed from trace.
- Stop on FX normalization gaps when reporting currency is active.
- Stop when sparse-factor fallback drives `method=none` above 5%.
- Stop on replay drift between current summary and as-of snapshot for the same run.

Primary references:
- `skills/spend-rapid-baseline/SKILL.md`
- `skills/compute-method-hierarchy/SKILL.md`
- `skills/replay-consistency/SKILL.md`
