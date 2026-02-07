---
name: scope12-implement
description: Implementation prompt for hardening and validating enterprise Scope 1/2 plugin controls.
---
# Implement

Use `Plans.md` as the source of milestone order.

Execution instructions:
1. Harden compute commands first (`scope1`, `scope2`) with explicit formulas, factor hierarchies, data-quality scoring, and blocking gates.
2. Harden KPI normalization command with boundary alignment, partial-period logic, rebasing triggers, and currency/deflator controls.
3. Harden reporting command with mandatory MB coverage table, evidence IDs, and claim quality disclosure.
4. Harden governance command so restatements are bound to immutable `evidence_snapshot_ids` and pinned factor/GWP versions.
5. Align skill modules to command behavior; do not leave policy drift between commands and skills.
6. Verify markdown frontmatter validity and confirm every command retains `allowed-tools`.
