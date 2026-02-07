---
name: closed-period-control
description: Verify closed-period behavior and force-gated recompute semantics for calculation jobs.
allowed-tools:
  - Bash
  - Read
  - Grep
---
Validate governance controls for closed reporting periods.

Checks:
1. Trigger compute on a closed job without `force` and confirm `409` block.
2. Re-run with explicit force control and confirm audit-safe path.
3. Verify run history captures the recompute event.

Gate:
- No ungoverned compute may proceed on closed periods.
