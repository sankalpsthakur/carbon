---
name: publish-scope12-report-pack
description: Produce an audit-ready Scope 1/2 reporting pack with tie-outs, market-based coverage disclosure, and evidence-linked claims.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Build the reporting pack only after compute and KPI commands pass all hard gates.

## Required report sections
1. Scope 1 breakdown
- Stationary, mobile, process, fugitive, total Scope 1, and separate biogenic CO2 disclosure.

2. Scope 2 dual totals
- Location-based total and market-based total.
- Narrative on factor hierarchy and certificate coverage.

3. Scope 1+2 totals
- `Scope12_LB_tCO2e`
- `Scope12_MB_tCO2e`

4. Normalized KPIs
- Revenue, unit output, FTE, and floor-area intensities.
- Base-year index trend table with rebase version annotations.

5. Method and factor appendix
- Factor set versions, GWP version, residual mix datasets, fallback exceptions, conversion assumptions.

6. Mandatory market-based coverage table
- Provide one row per site or site-market-carrier slice with fields:
  - `site_id`
  - `energy_carrier`
  - `kWh_load`
  - `kWh_matched`
  - `kWh_unmatched`
  - `coverage_pct = (kWh_matched / kWh_load) * 100`
  - `fallback_share_pct = (kWh_unmatched_assigned_fallback / kWh_load) * 100`
  - `residual_mix_source`
  - `residual_mix_version`
  - `fallback_exception_id`
  - `evidence_ids` (array)
  - `claim_quality_grade`

## Evidence and claim-quality disclosures
1. Evidence ID requirement
- Every MB matched row must include at least one `evidence_id` tied to immutable `evidence_snapshot_id`.
- Report appendix must list `evidence_id`, `instrument_type`, `registry_name`, `serial_numbers`, `vintage`, `retirement_date`, and `quantity_kwh`.

2. MB claim quality grading (mandatory)
- `HIGH`: matched kWh supported by complete retirement evidence and `fallback_share_pct <= 5`.
- `MEDIUM`: matched kWh evidence complete but `fallback_share_pct > 5` and `<= 20`.
- `LOW`: any matched kWh with incomplete evidence metadata or `fallback_share_pct > 20`.
- `NO_CLAIM`: no matched kWh.

## Tie-out checks
- `Scope1_total == stationary + mobile + process + fugitive`
- `Scope12_LB_kgCO2e == Scope1_total_kgCO2e + Scope2_LB_kgCO2e`
- `Scope12_MB_kgCO2e == Scope1_total_kgCO2e + Scope2_MB_kgCO2e`
- `sum(kWh_matched + kWh_unmatched) == sum(kWh_load)` for MB coverage table scope.
- Rounding is presentation-only; raw ledger totals remain unchanged.

## Publication gates
- Block publication when any blocking validation remains open.
- Block if period is closed and report version does not reference an approved restatement id.
- Block if MB disclosure lacks required coverage table columns.
- Block if any matched MB claim is missing `evidence_id` or `evidence_snapshot_id`.
- Block if claim quality grade is missing for any coverage row.
