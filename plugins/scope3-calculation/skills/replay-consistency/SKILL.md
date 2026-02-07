---
name: replay-consistency
description: Verifies deterministic replay and summary consistency across lca runs, history, and as-of snapshots.
---
Use this skill to validate reproducibility.

Flow:
1. Capture baseline summary and run id.
2. Compare with replay/as-of endpoints.
3. Verify totals and method mix are stable for same inputs.
