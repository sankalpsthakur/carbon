---
name: carbon-exec-engagements
description: Manage supplier engagement workflows -- list, update status, and track engagement progression.
allowed-tools:
  - mcp__exec-local__exec.engagement.list
  - mcp__exec-local__exec.engagement.update
  - mcp__exec-local__exec.db.get
  - mcp__exec-local__exec.maturity_score
---
Use this command to manage supplier engagements through the execution MCP server.

## Available operations

1. **List all engagements**:
   - `exec.engagement.list` returns every engagement record with supplier_id, status, and timestamps.

2. **Update engagement status**:
   - `exec.engagement.update` with `supplier_id` and `status`.
   - Valid statuses: `not_started`, `in_progress`, `pending_response`, `completed`, `on_hold`.
   - This is an upsert -- creates the engagement if none exists for that supplier.

3. **Check maturity impact**:
   - After updating, run `exec.maturity_score` to see how the new status affects the supplier's M0-M4 level.

## Status progression

```
not_started -> in_progress -> pending_response -> completed
                    \-> on_hold (pause)
```

## DB collection

| Collection   | Key fields                              |
|--------------|-----------------------------------------|
| engagements  | _id, supplier_id, status, updated_at    |

## Workflow

1. Run `exec.engagement.list` to see current state.
2. Identify suppliers needing status changes.
3. Call `exec.engagement.update` for each.
4. Verify with `exec.maturity_score` that scores updated correctly.
