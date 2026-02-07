---
name: carbon-swarm-run
description: Execute a swarm workflow by name with optional parameter overrides.
allowed-tools:
  - swarm.health
  - swarm.validate
  - swarm.run
  - swarm.status
  - swarm.stage.result
  - swarm.agent.spawn
  - swarm.gate.check
  - swarm.merge
  - swarm.recover
  - swarm.deliverable
  - swarm.list
  - swarm.db.get
  - swarm.db.set
  - swarm.db.list
  - Read
  - Glob
---

Run a swarm workflow end-to-end.

## Usage

`/carbon:swarm:run <workflow> [--params key=value ...]`

## Steps

1. **List available workflows** if no workflow name provided:
   Use `swarm.list` to show all workflow templates in the workflows/ directory.

2. **Validate the workflow** before execution:
   Use `swarm.validate` with `filename: "<workflow>"` to check schema compliance and DAG integrity.

3. **Start the run**:
   Use `swarm.run` with `workflow: "<workflow>"` and any `params` overrides.
   This returns:
   - `run_id`: Unique execution identifier
   - `dag_order`: Topological stage execution order
   - `dag_layers`: Parallelizable stage groups
   - `stage_count` and `total_agents`

4. **Execute each stage** following the DAG order:
   For each stage in `dag_order`, dispatch the declared agents using TeamCreate and SendMessage.
   After agents complete, use `swarm.gate.check` and `swarm.merge`.

5. **Assemble the deliverable**:
   Use `swarm.deliverable` with the `run_id` to produce the final output with SHA-256 hash.

6. **Report results** to the user with run_id, status, stage summaries, and deliverable hash.

## Parameter Overrides

Parameters are passed as `--params key=value` pairs. These override the `params` defaults in the workflow YAML.

Example: `/carbon:swarm:run rapid-baseline --params reporting_currency=EUR fiscal_year=FY2025`
