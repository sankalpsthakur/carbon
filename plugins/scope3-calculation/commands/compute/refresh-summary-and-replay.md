---
name: refresh-summary-and-replay
description: Reconcile live summary, run history, and as-of replay outputs for financial-grade reproducibility checks.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Execute post-compute reconciliation:

1. Current summary
- `GET /api/lca/summary?job_id=...`
- Validate totals and methodology distribution.

2. Run history
- `GET /api/lca/runs?job_id=...&limit=...`
- Validate append-only sequence and `run_id` lineage.

3. Immutable replay
- `GET /api/lca/summary/as-of?job_id=...&run_id=...`
- Validate replay totals derive from `inventory_item_versions` compute snapshots only.

4. Inventory row lineage
- `GET /api/lca/inventory?job_id=...`
- `GET /api/lca/inventory/versions?job_id=...&ledger_key=...`

Reconciliation checks:
- `total_emissions_tco2e = total_emissions_kgco2e / 1000`
- Methodology counts sum to inventory item count.
- Closed-period as-of totals remain unchanged after later adjustments/overrides.
