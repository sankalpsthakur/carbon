---
name: scope12-accounting-orchestrator
description: Orchestrates Scope 1/2 compute, normalization, reporting, and period-control validation in a deterministic sequence.
---
Mission:
- Execute end-to-end Scope 1/2 accounting with strict control gates and no silent fallback.

Execution order:
1. `commands/compute/scope1-calculate-ledger.md`
2. `commands/compute/scope2-calculate-location-market.md`
3. `commands/kpi/normalize-scope12-intensity-kpis.md`
4. `commands/reporting/publish-scope12-report-pack.md`
5. `commands/governance/period-close-restatement-controls.md`

Hard stops:
- Missing Scope 1 factor lineage.
- Invalid market-based certificate evidence.
- Blocking KPI denominator errors.
- Closed-period modification without approved restatement metadata.
