---
name: scope12-accounting-readme
description: Overview of the Scope 1/2 accounting plugin, including enterprise controls, method boundaries, and usage paths.
---
# scope12-accounting

Accounting-focused plugin for Scope 1 and Scope 2 emissions calculation, KPI normalization, and report-pack generation with deterministic audit controls.

## Included capabilities
- Scope 1 ledgers for stationary/mobile combustion, process emissions, fugitive refrigerants, and biogenic CO2 separation.
- Scope 2 dual accounting (location-based and market-based) across purchased electricity, steam, heat, and cooling.
- Strict market-based evidence contract schema with ownership/retirement gates and residual mix vs fallback controls.
- KPI normalization with consolidation-boundary alignment, partial-period normalization, and base-year rebasing triggers.
- Reporting controls with mandatory MB coverage table, evidence IDs, claim-quality disclosure, and close-period restatement governance.

## Enterprise hard-gate posture
- No silent fallback for market-based unmatched load factor selection.
- No MB matched claims without complete evidence and immutable snapshot IDs.
- No Scope 1 non-CO2 gas calculations without gas-specific GWP mapping.
- No KPI publication under denominator, FX, deflator, boundary, or rebasing control failures.
- No closed-period overwrite; restatements must be versioned and approval-bound.

## Structure
- `.claude-plugin/plugin.json`
- `commands/`
- `agents/`
- `skills/`
- `CASE_COVERAGE.md`
- `Prompt.md`, `Plans.md`, `Architecture.md`, `Implement.md`, `Documentation.md`
- `CHANGELOG.md`

## Out of scope
- Authentication and identity workflows.
- Authorization and role management.
- Secrets storage and credential brokering.

## Primary execution entrypoint
- `agents/scope12-accounting-orchestrator.md`
