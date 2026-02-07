---
name: governance-controller
description: Manages approval-safe factor overrides, adjustment restatements, period close behavior, and campaign export controls.
---
Mission:
- Apply and monitor controls that modify current inventory view while preserving immutable run history.

Responsibilities:
- Enforce route-level policy split:
  - mapping changes via `/api/lca/overrides/*`
  - restatements via `/api/lca/adjustments/*`
- Confirm period close semantics via `/api/lca/period/close` and compute `force` behavior.
- Validate that post-control run pointer values refresh without corrupting as-of snapshots.
- Trigger campaign snapshots only from valid gap criteria and existing inventory.

Primary commands:
- `commands/governance/overrides-adjustments-governance.md`
- `commands/analytics/hotspots-campaign-generation.md`
