---
name: normalize-scope12-intensity-kpis
description: Compute normalized Scope 1/2 KPI intensities with boundary alignment, rebasing controls, and constant-currency comparability.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Generate normalized KPIs using Scope 1+2 totals (market-based default for target tracking, with LB reported in parallel where required).

## Consolidation and period alignment controls
1. Consolidation-boundary alignment
- KPI denominators must use the same consolidation method and legal-entity boundary as emissions (`financial_control`, `operational_control`, or `equity_share`).
- Denominator rows with boundary mismatch are excluded and treated as blocking validation failures.

2. Partial-period normalization
- For entities entering or exiting during period:
  - `coverage_ratio_entity = active_days_in_period_entity / total_days_in_period`
  - `Revenue_aligned = sum(Revenue_entity * coverage_ratio_entity)`
  - `Units_aligned = sum(Units_entity * coverage_ratio_entity)`
  - `Floor_area_aligned_m2 = sum(Floor_area_entity * coverage_ratio_entity)`
  - `Avg_FTE_period = sum(FTE_month * active_days_month) / sum(active_days_month)`
- If active-day coverage metadata is missing for a partial-period entity, block KPI publication.

## Revenue normalization rules (constant currency and deflator)
1. Convert to reporting currency
- `Revenue_reporting = sum(Revenue_local_currency * FX_avg_period_local_to_reporting)`

2. Constant-currency normalization
- `Revenue_constant_currency = sum(Revenue_local_currency * FX_base_year_local_to_reporting)`

3. Deflator normalization to base-year prices
- `Revenue_real_base_year = Revenue_reporting * (Deflator_base_year / Deflator_period)`
- Use `Revenue_real_base_year` as denominator for external trend comparability unless policy specifies constant-currency only.

## KPI formulas
- `KPI_tCO2e_per_mUSD_real = E_scope12_mb_tCO2e / (Revenue_real_base_year / 1_000_000)`
- `KPI_tCO2e_per_mUSD_constant = E_scope12_mb_tCO2e / (Revenue_constant_currency / 1_000_000)`
- `KPI_kgCO2e_per_unit = (E_scope12_mb_tCO2e * 1000) / Units_aligned`
- `KPI_tCO2e_per_FTE = E_scope12_mb_tCO2e / Avg_FTE_period`
- `KPI_kgCO2e_per_m2 = (E_scope12_mb_tCO2e * 1000) / Floor_area_aligned_m2`
- Optional LB companion metric:
  - `KPI_lb_tCO2e_per_mUSD_real = E_scope12_lb_tCO2e / (Revenue_real_base_year / 1_000_000)`

## Base-year indexing and rebasing controls
1. Trend index formula
- `Intensity_Index_vs_BaseYear = (KPI_current / KPI_base_year) * 100`

2. Mandatory rebasing triggers
- Acquisition, merger, divestiture, or boundary transfer causing material structural change.
- Consolidation method change (`financial_control`, `operational_control`, `equity_share`).
- Material methodology change in numerator or denominator logic.
- Factor set or GWP version change that materially alters base-year KPI.
- Error correction or restatement impacting base-year or comparison-year values.

3. Rebase procedure gates
- On trigger, recalculate base year and all impacted historical periods before publishing current KPI.
- Preserve prior published index series with version tag; do not overwrite historical published versions in place.
- Block publication if rebasing trigger evaluation is missing or unresolved.

## Hard gates
- If denominator is `0`, negative when policy-disallowed, or missing, set KPI to `null` and raise blocking error.
- If FX set is incomplete for reporting or constant-currency conversion, block KPI publication.
- If deflator series is missing for any reported period, block real-revenue KPI publication.
- If emissions are restated, all impacted KPI periods must be recomputed before publication.
- If consolidation-boundary IDs differ between emissions and denominators, block publication.
- If partial-period entities have missing active-day metadata, block publication.

## Required trace fields
- `kpi_id`, `numerator_version_id`, `denominator_dataset_id`, `consolidation_method`, `boundary_version_id`, `coverage_ratio`, `fx_set_version`, `deflator_series_version`, `base_year`, `rebase_trigger_flags`, `kpi_value`, `kpi_status`.
