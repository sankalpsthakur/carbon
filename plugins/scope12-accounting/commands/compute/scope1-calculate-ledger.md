---
name: scope1-calculate-ledger
description: Calculate Scope 1 direct emissions with explicit formulas for stationary, mobile, process, and fugitive sources, including biogenic separation and gas-level GWP controls.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Execute Scope 1 accounting in this order.

## Method rules
1. Stationary combustion
- Aggregate formula:
  - `E_stationary_kgCO2e = sum(activity_fuel * EF_fuel_kgCO2e_per_unit)`
- Gas-resolved formula (fossil + non-CO2):
  - `E_stationary_fossil_kgCO2e = sum(activity * (EF_CO2_fossil + EF_CH4 * GWP_CH4 + EF_N2O * GWP_N2O + sum(EF_nonCO2_gas_j * GWP_gas_j)))`
- Biogenic CO2 tracking formula:
  - `E_stationary_biogenic_CO2_kg = sum(activity * EF_CO2_biogenic)`

2. Mobile combustion
- Fuel-based formula:
  - `E_mobile_kgCO2e = sum(fuel_volume_or_mass * EF_fuel_kgCO2e_per_unit)`
- Distance fallback (allowed only with approved proxy exception and documented factor lineage):
  - `E_mobile_kgCO2e = sum(distance * EF_distance_kgCO2e_per_km)`

3. Process emissions
- Process formula:
  - `E_process_kgCO2e = sum(process_activity * EF_process_kgCO2e_per_unit)`
- Biogenic process CO2, when applicable:
  - `E_process_biogenic_CO2_kg = sum(process_activity * EF_process_CO2_biogenic_kg_per_unit)`

4. Fugitive refrigerants
- Mass-balance leak:
  - `Leakage_kg = Inventory_begin + Purchases - Inventory_end - Returned_for_reclaim`
- Gas-level conversion:
  - `E_fugitive_kgCO2e = sum(Leakage_gas_kg * GWP_gas)`

5. Biogenic separation and Scope 1 totals
- `E_scope1_total_kgCO2e = E_stationary_fossil_kgCO2e + E_mobile_kgCO2e + E_process_kgCO2e + E_fugitive_kgCO2e`
- `E_scope1_total_tCO2e = E_scope1_total_kgCO2e / 1000`
- `E_scope1_biogenic_CO2_kg = E_stationary_biogenic_CO2_kg + E_process_biogenic_CO2_kg`
- Biogenic CO2 is disclosed separately and excluded from `E_scope1_total_kgCO2e`.
- CH4, N2O, and other non-CO2 gases from biogenic fuel use remain in Scope 1 CO2e totals.

## Non-CO2 gas and GWP controls
1. Allowed gases
- At minimum: `CH4`, `N2O`, `HFCs`, `PFCs`, `SF6`, `NF3`, and refrigerant blend constituents where available.

2. GWP version lock
- Every run must use one immutable `gwp_version` across all records.
- Mixing GWP tables within a run is prohibited.

3. Blend handling
- Use blend-specific GWP when published in selected `gwp_version`.
- If blend GWP is unavailable, compute from verified composition-weighted constituents; otherwise block.

## Factor hierarchy and data-quality scoring
1. Factor hierarchy (highest to lowest)
1. Site-specific measured or calibrated factor set.
2. Supplier-specific or regulator-approved factor set.
3. National inventory factor set.
4. International default factor set (for example IPCC), allowed only with approved exception.

2. Activity data hierarchy (highest to lowest)
1. Direct metered data.
2. Invoice or custody-transfer data.
3. Engineering estimate.
4. Proxy estimate.

3. Required data-quality scoring
- Score each ledger row on `completeness`, `measurement_quality`, `temporal_representativeness`, `geographic_representativeness`, and `technological_representativeness` (1 best to 5 worst).
- `dq_score = weighted_mean(component_scores)` using immutable configured weights.

## Hard gates
- Reject records with unknown unit conversion.
- Reject rows with missing GWP for any non-CO2 gas used in calculation.
- Reject refrigerant rows with missing `GWP_refrigerant`.
- If `Leakage_kg < 0`, require approved exception record; otherwise block close.
- Reject factor selections that skip a higher hierarchy level without approved exception metadata.
- Reject proxy activity data (`activity_data_tier = proxy`) unless `proxy_exception_id` is approved.
- Reject rows with `dq_score > 3.0` unless data-quality waiver is approved.
- Do not mix lower and higher heating value factors in one factor set unless conversion is documented.

## Required trace fields
- `source_type`, `activity_value`, `activity_unit`, `activity_data_tier`, `factor_id`, `factor_source_level`, `factor_year`, `factor_source`, `gwp_version`, `is_biogenic`, `biogenic_co2_kg`, `nonco2_gases_used`, `dq_score`, `proxy_exception_id`, `calculated_kgco2e`.
