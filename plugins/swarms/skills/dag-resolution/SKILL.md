---
name: dag-resolution
description: How to resolve DAG ordering from swarm workflow definitions, detect cycles, and identify parallelizable stages.
---

## DAG Resolution for Swarm Workflows

A swarm workflow defines stages with `depends_on` relationships forming a Directed Acyclic Graph (DAG). Correct resolution is critical for execution ordering and parallelism.

## Topological Sort (Kahn's Algorithm)

1. Build an adjacency list and compute in-degrees for all stages.
2. Initialize a queue with all stages having in-degree 0 (no dependencies).
3. Process the queue in layers:
   - All stages in the current queue form one **parallel layer**.
   - Remove each stage, decrement in-degrees of its dependents.
   - Add newly zero-in-degree stages to the next layer's queue.
4. If the total processed count does not equal the stage count, the DAG has a cycle.

## Cycle Detection

Cycles are detected via DFS with a recursion stack:
- Maintain `visited` (globally processed) and `inStack` (current DFS path) sets.
- If a node is encountered that is already in `inStack`, a cycle exists.
- Report the first cycle-participating node for debugging.

## Layer Identification

The topological sort naturally produces layers:
- **Layer 0**: Stages with no dependencies (entry points).
- **Layer N**: Stages whose last dependency was resolved in Layer N-1.
- All stages within the same layer can execute in parallel.

## Dependency Resolution for Inputs

Stages can reference outputs from prior stages using `$stages.<stage_id>.outputs.<key>`:
- Before dispatching a stage, resolve all `$stages.*` references from completed stage results.
- `$params.*` references resolve from the workflow params merged with runtime overrides.

## Example

```yaml
stages:
  - id: ingest
    depends_on: []          # Layer 0
  - id: calculate
    depends_on: [ingest]    # Layer 1
  - id: audit
    depends_on: [ingest]    # Layer 1 (parallel with calculate)
  - id: report
    depends_on: [calculate, audit]  # Layer 2
```

Execution plan:
- Layer 0: `[ingest]`
- Layer 1: `[calculate, audit]` (parallel)
- Layer 2: `[report]`
