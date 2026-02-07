---
name: reporting-assurance-rules
description: Assurance rules for Scope 1/2 report publication with market-based coverage disclosure, evidence traceability, and restatement provenance controls.
---
Use when assembling final disclosure and management reporting outputs.

## Report-level tie-outs
- `Scope1_total = stationary + mobile + process + fugitive`
- `Scope12_LB_kgCO2e = Scope1_total_kgCO2e + Scope2_LB_kgCO2e`
- `Scope12_MB_kgCO2e = Scope1_total_kgCO2e + Scope2_MB_kgCO2e`
- `sum(kWh_matched + kWh_unmatched) == sum(kWh_load)` for MB coverage rows.

## Mandatory MB disclosure table
Required fields per row:
- `site_id`, `energy_carrier`, `kWh_load`, `kWh_matched`, `kWh_unmatched`, `coverage_pct`
- `residual_mix_source`, `residual_mix_version`, `fallback_exception_id`
- `evidence_ids`, `claim_quality_grade`

## Evidence and quality controls
1. Every matched MB claim must reference immutable `evidence_id` and `evidence_snapshot_id`.
2. Report appendix must disclose instrument, registry, serials, vintage, retirement, and quantity.
3. Claim quality grade is mandatory (`HIGH`, `MEDIUM`, `LOW`, `NO_CLAIM`).

## Versioning and close rules
1. Closed periods are immutable.
2. Restatements create new versions and preserve prior versions.
3. Published outputs must reference compute version, factor set versions, and evidence snapshot ids.

## Publication blocks
- Blocking validation errors still open.
- Missing MB coverage table or missing required coverage columns.
- Matched MB claims missing evidence IDs.
- KPI tables with unresolved denominator or rebasing failures.
