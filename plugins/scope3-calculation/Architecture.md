# Architecture

## Principles
1. Capability-aligned decomposition
- One command + one skill + one agent per business capability.

2. Auditability first
- Commands center append-only run replay, lineage endpoints, hash-digested totals where applicable, and explicit gate failure semantics.

3. Fail-closed edge handling
- Functional unit, conversion evidence, co-product allocation, no silent downshift, mixed units, FX gaps, sparse factors, and replay drift are hard gates, not warnings.

4. Plugin-local ownership
- All enhancements remain inside this plugin folder to avoid cross-team collisions.

## Constraints
- Commands must include YAML frontmatter with `allowed-tools`.
- Agents and skills must include YAML frontmatter with `name` and `description`.
- References should stay consistent with existing API contracts and trace model.
- Layout must remain compatible with plugin manifest directories (`commands`, `agents`, `skills`, `hooks`, `mcp`).
