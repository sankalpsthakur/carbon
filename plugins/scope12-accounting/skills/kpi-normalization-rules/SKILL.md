---
name: kpi-normalization-rules
description: Rules and equations for Scope 1/2 intensity KPI normalization with rebasing controls, constant-currency comparability, and boundary alignment.
---
Use when computing intensity metrics from Scope 1+2 totals.

## Denominator normalization rules
1. Exact period boundary alignment between emissions and denominators.
2. Consolidation-boundary and method alignment with emissions data.
3. Partial-period normalization by active-day coverage ratio.
4. Revenue normalization with both constant-currency and deflator-based real terms.

## Core equations
- `coverage_ratio = active_days_entity / total_days_period`
- `Revenue_reporting = sum(Revenue_local * FX_avg_period)`
- `Revenue_constant_currency = sum(Revenue_local * FX_base_year)`
- `Revenue_real_base_year = Revenue_reporting * (Deflator_base_year / Deflator_period)`
- `KPI_tCO2e_per_mUSD_real = E_scope12_mb_tCO2e / (Revenue_real_base_year / 1_000_000)`
- `KPI_kgCO2e_per_unit = (E_scope12_mb_tCO2e * 1000) / Units_aligned`
- `Intensity_Index_vs_BaseYear = (KPI_current / KPI_base_year) * 100`

## Mandatory rebasing triggers
- Material M&A/divestiture or structural boundary change.
- Consolidation method change.
- Methodology, factor set, or GWP change with material KPI impact.
- Error-driven restatement affecting base-year or comparison-year values.

## Data-quality gates
- Zero/missing denominator yields `null` KPI and blocking status.
- Incomplete FX or deflator datasets block publication.
- Missing partial-period coverage metadata blocks publication.
- Triggered rebasing must be completed before publishing updated trend series.
