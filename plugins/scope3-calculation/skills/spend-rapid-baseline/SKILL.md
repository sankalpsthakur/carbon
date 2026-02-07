---
name: spend-rapid-baseline
description: Builds a spend-first rapid Scope 3 baseline screenshot with strict factor fallback, FX readiness, and replay consistency checks.
---
Use when:
- You need a same-day baseline before quantity/primary data is complete.
- Finance or sustainability teams want a fast but controlled directional inventory.

Core workflow:
1. Confirm ingest readiness (`status=DONE`) and reconciliation completeness.
2. Ensure factor library exists and spend-basis fallback is available.
3. Run `/api/lca/compute` with `refresh=true`.
4. Build screenshot packet from `/summary`, `/hotspots`, `/gaps`, and `/inventory`.
5. Reconcile run replay using `/summary/as-of`.

Method expectations:
- Prefer `supplier_primary` when present.
- Use `average_quantity` only with compatible units.
- Use `spend` as the primary rapid-baseline fallback.
- Allow `none` only as exception inventory.

Hard gates:
1. Mixed units: no unresolved unit mismatch on quantity-derived methods.
2. FX gaps: no missing FX pair when reporting currency is active.
3. Sparse factors: `none` method must remain <= 5% of inventory rows.
4. Replay drift: summary and as-of for same `run_id` must match within `1e-9`.

Primary command:
- `commands/baseline/spend-rapid-baseline-screenshot.md`
