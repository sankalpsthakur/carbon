---
name: self-healing
description: Failure classification taxonomy and recovery patterns for swarm execution.
---

## Self-Healing in Swarm Execution

Swarm workflows involve multiple agents, MCP tools, and data dependencies. Failures are expected. The self-healing system classifies failures and applies structured recovery.

## Failure Taxonomy

### 1. timeout
**Detection**: Agent did not produce output within `timeout_minutes`.
**Root causes**:
- Task scope too large for a single agent pass.
- MCP server unresponsive (e.g., data directory locked).
- Agent entered a reasoning loop without tool calls.
**Severity**: Medium. Usually transient.

### 2. gate_violation
**Detection**: `swarm.gate.check` returned `passed: false`.
**Root causes**:
- Too many agents failed (quorum not met).
- Agent outputs contradict each other (unanimous failed).
- Custom gate conditions not satisfied.
**Severity**: High. Indicates systematic issue with the stage.

### 3. tool_error
**Detection**: Agent received an MCP tool error response (`isError: true`).
**Root causes**:
- Missing collection or data (upstream stage incomplete).
- Malformed tool arguments (agent misunderstood the schema).
- MCP server crashed or not started.
**Severity**: Medium. Often fixable.

### 4. data_missing
**Detection**: Agent completed but output lacks required keys or is empty.
**Root causes**:
- Input resolution failed (`$stages.*.outputs.*` reference to missing data).
- Upstream stage produced partial results.
- Parameter misconfiguration.
**Severity**: Medium. Requires upstream investigation.

### 5. agent_crash
**Detection**: Agent process terminated without producing output.
**Root causes**:
- Context window exceeded (too much data in prompt).
- Model rate limit or quota.
- System resource exhaustion.
**Severity**: High. May require task decomposition.

## Recovery Decision Tree

```
Failure detected
  |
  +-- Is this the 3rd retry? --> ESCALATE to human
  |
  +-- Is it a timeout?
  |     +-- Increase timeout by 50%, RETRY
  |
  +-- Is it a tool_error?
  |     +-- Check MCP server health
  |     +-- If server down: restart server, RETRY
  |     +-- If bad args: fix input resolution, RETRY_WITH_FIX
  |
  +-- Is it a gate_violation?
  |     +-- If quorum: check which agents failed, RETRY failed agents only
  |     +-- If unanimous: examine disagreements, RETRY_WITH_FIX (add clarifying context)
  |     +-- If custom: check conditions, ESCALATE if unclear
  |
  +-- Is it data_missing?
  |     +-- Check upstream stage results
  |     +-- If upstream incomplete: REPLAY from upstream stage
  |     +-- If params wrong: fix params, RETRY_WITH_FIX
  |
  +-- Is it agent_crash?
        +-- Reduce task scope (split into sub-tasks)
        +-- REASSIGN to fresh agent instance
```

## Recovery Actions

| Action | Description | Max attempts |
|--------|-------------|--------------|
| `retry` | Re-dispatch the same agent with same inputs | 2 |
| `retry_with_fix` | Modify inputs or prompt, then re-dispatch | 2 |
| `reassign` | Dispatch a different agent for the same task | 1 |
| `escalate` | Stop and notify the human operator with full context | 1 |
| `replay` | Use `swarm.replay` to re-run from an earlier stage | 1 |

## Logging

Every recovery action is logged to the swarm run record:
- Timestamp
- Failure classification
- Recovery action taken
- Outcome (success/failure)
- Retry count

This creates an audit trail for post-mortem analysis.
