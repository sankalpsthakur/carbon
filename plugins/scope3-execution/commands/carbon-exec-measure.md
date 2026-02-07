---
name: carbon-exec-measure
description: Run the full execution pipeline or individual stages -- seed, sources, ingest, seed_data, generate -- and validate outcomes.
allowed-tools:
  - mcp__exec-local__exec.pipeline.run
  - mcp__exec-local__exec.pipeline.stage
  - mcp__exec-local__exec.quality_gates
  - mcp__exec-local__exec.db.list
---
Use this command to orchestrate the 5-stage execution pipeline.

## Full pipeline run

Call `exec.pipeline.run` with optional `period` (e.g. "2025"). This executes all stages in order:

1. **seed** -- Baseline emission factors check.
2. **sources** -- Index registered documents.
3. **ingest** -- Mark documents as ingested, prepare for processing.
4. **seed_data** -- Verify benchmarks and evidence data.
5. **generate** -- Generate supplier recommendations.

Returns a `run_id` and per-stage results.

## Individual stage execution

Use `exec.pipeline.stage` with `stage` set to one of: `seed`, `sources`, `ingest`, `seed_data`, `generate`.

Useful for isolating failures or re-running a single step.

## Quality gates

After a pipeline run, call `exec.quality_gates` with the `run_id` to check:
- All pipeline stages completed
- Suppliers exist in DB
- Emission factors loaded
- No orphan provenance records
- All documents ingested

Returns `pass` or `fail` with per-gate detail.

## DB collections affected

| Collection      | Stage          | Operation            |
|-----------------|----------------|----------------------|
| emission_factors| seed           | Read                 |
| documents       | sources, ingest| Read, Update         |
| benchmarks      | seed_data      | Read                 |
| evidence        | seed_data      | Read                 |
| suppliers       | generate       | Read, Update         |
| pipeline_runs   | all            | Write (audit log)    |

## Validation workflow

1. Run `exec.pipeline.run { period: "2025" }`.
2. Run `exec.quality_gates { run_id: "<from step 1>" }`.
3. If any gate fails, use `exec.db.list` on the relevant collection to diagnose.
4. Re-run individual stages with `exec.pipeline.stage` as needed.
