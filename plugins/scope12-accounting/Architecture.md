---
name: scope12-architecture
description: Architecture principles and constraints for enterprise-grade Scope 1/2 accounting plugin execution.
---
# Architecture

## Principles
- Deterministic accounting: identical inputs and version pins must reproduce identical totals.
- Explicit hierarchy control: factor selection and fallback paths are deterministic, logged, and auditable.
- Evidence-bound market claims: MB matching is valid only with complete evidence and immutable snapshot linkage.
- Biogenic clarity: biogenic CO2 is disclosed separately while non-CO2 gases remain in Scope 1 totals.
- KPI comparability: trend series use boundary-aligned, partial-period-normalized, and currency/deflator-normalized denominators.
- Immutable close governance: closed periods are append-only through approved restatement versions.

## Data constraints
- Base storage precision: `kgCO2e` numeric with at least 6 decimal places.
- Published presentation: `tCO2e` rounded for display only; raw precision retained for audit.
- Energy units: convert all purchased energy to canonical `kWh` units before factor application.
- Version pins required: factor set versions, GWP version, residual mix dataset version, evidence snapshot IDs.
- No mutable aliases (`latest`) in calculation or publication traces.

## Control constraints
- No silent MB fallback from residual mix to grid-average fallback.
- No MB matched claim without ownership and retirement evidence.
- No KPI publication when rebasing triggers are unresolved.
- No closed-period overwrite without approved restatement metadata.

## Out of scope
- Authn/authz, account provisioning, SSO, token management.
