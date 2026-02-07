---
name: scope1-method-rules
description: Detailed formulas and hard gates for Scope 1 direct emissions accounting with biogenic separation, gas-level GWPs, and data-quality controls.
---
Use when building or validating Scope 1 ledgers.

## Coverage
- Stationary combustion
- Mobile combustion
- Process emissions
- Fugitive refrigerants
- Biogenic CO2 disclosure (separate from Scope 1 total)

## Core formulas
- `E_stationary_fossil_kgCO2e = sum(activity * (EF_CO2_fossil + EF_CH4 * GWP_CH4 + EF_N2O * GWP_N2O + sum(EF_nonCO2_gas_j * GWP_gas_j)))`
- `E_stationary_biogenic_CO2_kg = sum(activity * EF_CO2_biogenic)`
- `E_mobile_kgCO2e = sum(fuel_or_distance_activity * EF_applicable)`
- `E_process_kgCO2e = sum(process_activity * EF_process)`
- `Leakage_kg = Inventory_begin + Purchases - Inventory_end - Returned_for_reclaim`
- `E_fugitive_kgCO2e = sum(Leakage_gas_kg * GWP_gas)`
- `E_scope1_total_kgCO2e = E_stationary_fossil + E_mobile + E_process + E_fugitive`

## Method rules
1. Biogenic CO2 is tracked and disclosed separately; exclude from Scope 1 total CO2e.
2. Non-CO2 gases from biogenic and non-biogenic activity remain in Scope 1 CO2e totals.
3. Lock one `gwp_version` per run; no mixed GWP tables.
4. Use blend-specific refrigerant GWP, or composition-weighted GWP when documented.

## Factor and data quality hierarchy
- Factor hierarchy: site-specific -> supplier/regulator -> national inventory -> international default (exception required at lowest tier).
- Activity hierarchy: direct meter -> invoice/custody transfer -> engineering estimate -> proxy (exception required).
- Required DQ scoring dimensions: completeness, measurement quality, temporal, geographic, technological representativeness.

## Blocking conditions
- Missing or stale factor metadata.
- Missing GWP on any gas in use.
- Ambiguous unit conversion paths.
- Proxy activity data without approved exception.
- `dq_score > 3.0` without approved waiver.
