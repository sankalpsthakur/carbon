---
name: carbon-strategy-assessment
description: Create and manage DMA assessments for an organization using the strategy MCP server.
allowed-tools:
  - mcp__strategy-local__strategy.health
  - mcp__strategy-local__strategy.assessment.create
  - mcp__strategy-local__strategy.assessment.get
  - mcp__strategy-local__strategy.db.list
  - mcp__strategy-local__strategy.snapshot
  - Read
  - Write
---
Use this flow to bootstrap a new DMA assessment or inspect an existing one.

Execution sequence:

1. Health check
- Call `strategy.health` to confirm the MCP server is running and responsive.

2. Create assessment
- Call `strategy.assessment.create` with `org_id` and `year`.
- The server enforces one active (non-finalized) assessment per org+year.
- Record the returned `assessment_id` for all downstream operations.

3. Inspect assessment
- Call `strategy.assessment.get` with the `assessment_id` to verify status, finalized flag, and snapshot count.
- Use `strategy.db.list` with collection `assessments` to enumerate all assessments if needed.

4. Snapshot (optional)
- Call `strategy.snapshot` with `assessment_id` to create a point-in-time snapshot.
- Add `finalize: true` only when all IROs are scored and have evidence. Finalization is irreversible.

Validation gates:
- Duplicate active assessments for the same org+year are rejected.
- Finalization is blocked when any IRO has zero evidence links.
- All mutations are blocked once an assessment is finalized (HTTP 409 equivalent).

Deliverable:
- Assessment record with `assessment_id`, org/year metadata, status, and snapshot history.
