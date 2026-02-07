---
name: carbon-swarm-replay
description: Re-execute a swarm run from a checkpoint stage.
allowed-tools:
  - swarm.replay
  - swarm.status
  - swarm.stage.result
  - swarm.run
  - swarm.agent.spawn
  - swarm.gate.check
  - swarm.merge
  - swarm.recover
  - swarm.deliverable
  - swarm.db.get
  - Read
---

Replay a swarm run from a specific checkpoint, reusing prior stage results.

## Usage

`/carbon:swarm:replay <run_id> [--from-stage <stage_id>]`

## Steps

1. **Verify the original run** exists using `swarm.status` with the `run_id`.

2. **Identify the replay point**:
   - If `--from-stage` is provided, replay from that stage forward.
   - If omitted, replay the entire workflow from the beginning.

3. **Start the replay** using `swarm.replay`:
   - `run_id`: The original run to replay from
   - `from_stage`: The stage to restart from (optional)
   This returns a new `run_id` for the replay with:
   - `stages_reused`: Number of stages copied from the original run
   - `stages_to_replay`: Number of stages to re-execute
   - `replay_order`: Stage IDs to execute

4. **Execute remaining stages** following the replay order, same as a normal run.

5. **Assemble the deliverable** once all stages complete.

## Use Cases

- A late-stage gate failed and you fixed the input data.
- An agent timed out and you want to retry just that stage.
- Parameters changed for downstream stages but upstream results are still valid.
