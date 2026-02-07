---
name: carbon-swarm-status
description: Check the execution status of a swarm run.
allowed-tools:
  - swarm.status
  - swarm.stage.result
  - swarm.db.get
  - swarm.db.list
  - Read
---

Check the current status of a swarm run or list recent runs.

## Usage

`/carbon:swarm:status [run_id]`

## Steps

### With run_id

1. Call `swarm.status` with the `run_id`.
2. Display:
   - **Workflow name** and run ID
   - **Status**: running, completed, failed, replaying
   - **Current stage** (if running)
   - **Progress**: stages completed / total
   - **Timing**: started_at, completed_at, elapsed

3. For each completed stage, optionally call `swarm.stage.result` to show:
   - Gate result (passed/failed)
   - Merge strategy used
   - Output summary

### Without run_id

1. Call `swarm.db.list` with `collection: "swarm_runs"` to list recent runs.
2. Display a summary table with: run_id, workflow name, status, started_at.
