---
name: agent-dispatch
description: How to map swarm workflow agent definitions to Claude Code TeamCreate and SendMessage calls for multi-agent execution.
---

## Agent Dispatch for Swarm Stages

Each stage in a swarm workflow declares one or more agents. Each agent must be dispatched as a Claude Code teammate with the correct tools, context, and task.

## Mapping Workflow Agents to Claude Code

A workflow agent definition:
```yaml
agents:
  - role: calculator
    agent: spend-baseline-operator
    plugin: scope3-calculation
    task: "Compute spend-based emissions for the provided activity data"
    tools: [calc.compute, calc.db.get, calc.ingest]
    inputs:
      job_id: "$stages.ingest.outputs.job_id"
    outputs: [emissions_total, method_counts]
```

Maps to Claude Code operations:

1. **TeamCreate** with:
   - Agent name derived from `role` and stage ID (e.g., `calculator-stage-compute`)
   - Agent instructions loaded from `plugins/<plugin>/agents/<agent>.md`

2. **SendMessage** with:
   - Task description from the `task` field
   - Resolved inputs (replace `$stages.*` and `$params.*` references)
   - Tool permissions from the `tools` array

## Input Resolution

Before dispatch, resolve all input references:
- `$params.<key>`: From workflow params merged with runtime overrides.
- `$stages.<stage_id>.outputs.<key>`: From the merged output of a completed prior stage.
- Literal values pass through unchanged.

## Output Collection

After an agent completes:
1. Parse the agent's final message for structured output.
2. Extract values matching the declared `outputs` keys.
3. Store in the stage's result record for downstream reference.

## Parallel Dispatch

When a stage has multiple agents:
- Dispatch all agents simultaneously using parallel TeamCreate calls.
- Each agent operates independently with its own tool permissions.
- The stage-supervisor collects outputs as agents complete.
- No agent can see another agent's output within the same stage (isolation).

## Tool Permissions

The `tools` array in the agent definition restricts which MCP tools the agent can call. This is enforced by including only those tools in the agent's allowed-tools list. Always include `Read` and `Glob` as baseline tools for file access.
