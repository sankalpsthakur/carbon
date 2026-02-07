---
name: period-lock-and-docstore-gates
description: Validate execution period-lock enforcement and docstore prerequisites before write operations.
allowed-tools:
  - Bash
  - Read
  - Grep
---
Run operations control checks before heavy execution.

Checks:
1. Verify lock list via `GET /api/execution/reporting-period-locks`.
2. Confirm writes against locked period fail with `423`.
3. Verify `DOCSTORE_KEY` prerequisites for doc upload/render-store operations.

Gate:
- Block run if lock and storage rules are violated.
