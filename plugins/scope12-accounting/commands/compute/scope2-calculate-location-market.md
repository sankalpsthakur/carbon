---
name: scope2-calculate-location-market
description: Calculate Scope 2 location-based and market-based emissions for purchased electricity, steam, heat, and cooling with evidence-backed contractual claims.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Run Scope 2 accounting in dual ledgers (LB and MB) for purchased energy only.

## Activity model and unit conversions
1. Included purchased energy carriers
- Electricity imported from grid or third-party on-site supply.
- Purchased steam, purchased heat, and purchased cooling.
- Exclude owned generation consumed on-site from Scope 2 (treat under Scope 1 or other scopes as applicable).

2. Canonical energy units
- Convert all electricity to `kWh_e` and all thermal energy (steam/heat/cooling) to `kWh_th` before factor application.
- Required conversion factors:
  - `kWh = MWh * 1000`
  - `kWh = GJ * 277.777778`
  - `kWh = MMBtu * 293.071070`
- If factor units differ, normalize factors before multiplication:
  - `EF_kgCO2e_per_kWh = EF_kgCO2e_per_MWh / 1000`
  - `EF_kgCO2e_per_kWh = EF_kgCO2e_per_GJ / 277.777778`
  - `EF_kgCO2e_per_kWh = EF_kgCO2e_per_MMBtu / 293.071070`

## Electricity treatment (on-site generation, self-consumption, export)
1. Metered terms
- `kWh_import`: electricity imported from grid or third-party supplier.
- `kWh_gen_onsite`: electricity generated on site.
- `kWh_export`: metered electricity exported to grid or third parties.
- `kWh_self_consumed_onsite = max(0, kWh_gen_onsite - kWh_export)`
- `kWh_net_import = max(0, kWh_import - kWh_export)`

2. Scope boundary rules
- LB and MB electricity calculations use `kWh_net_import` for purchased grid-delivered electricity.
- Owned on-site self-generation is not purchased electricity and is excluded from Scope 2 activity.
- Third-party-owned on-site generation consumed by the reporting entity is purchased electricity and must be included in `kWh_import`.

3. EAC ownership and export rules
- MB low/zero-carbon claims are allowed only when attributes are owned and retired for the reporting entity.
- If on-site generation attributes are sold or transferred out, equivalent kWh cannot be treated as matched.
- Exported generation cannot be used to reduce imported-load MB emissions unless retained-attribute ownership and retirement are evidenced for the same load period and market.
- Claims without ownership and retirement evidence are reclassified to unmatched load.

## Location-based formulas
- `E_electricity_lb_kgCO2e = sum(kWh_net_import_i * EF_grid_avg_i_kgCO2e_per_kWh)`
- `E_steam_lb_kgCO2e = sum(kWh_steam_purchased_i * EF_steam_lb_i_kgCO2e_per_kWh)`
- `E_heat_lb_kgCO2e = sum(kWh_heat_purchased_i * EF_heat_lb_i_kgCO2e_per_kWh)`
- `E_cooling_lb_kgCO2e = sum(kWh_cooling_purchased_i * EF_cooling_lb_i_kgCO2e_per_kWh)`
- `E_scope2_lb_kgCO2e = E_electricity_lb_kgCO2e + E_steam_lb_kgCO2e + E_heat_lb_kgCO2e + E_cooling_lb_kgCO2e`

## Market-based hierarchy and deterministic selection
1. Factor hierarchy per site, carrier, and load slice
1. Verified supplier-specific contractual factor.
2. Residual mix factor for exact market, carrier, and year.
3. Fallback factor (grid average or approved regulatory default) only when residual mix is unavailable and an approved exception exists.

2. Selection logic (no silent fallback)
- `if contractual_factor_valid then use contractual`
- `else if residual_mix_available then use residual_mix`
- `else if fallback_available and fallback_exception_approved then use fallback`
- `else fail run`
- Every selection decision must be logged; implicit or unlogged fallback is prohibited.

3. MB formulas across electricity and thermal carriers
- `kWh_matched_i = min(kWh_load_i, EAC_or_contract_eligible_kWh_i)`
- `kWh_unmatched_i = max(0, kWh_load_i - kWh_matched_i)`
- `E_mb_i_kgCO2e = (kWh_matched_i * EF_contract_i) + (kWh_unmatched_i * EF_unmatched_selected_i)`
- `E_scope2_mb_kgCO2e = sum(E_mb_i_kgCO2e across all sites and carriers)`

## Market-based evidence contract schema (mandatory)
For each matched MB claim, require one evidence object containing all fields below.
- `evidence_id`: immutable ID (`uuid` or content-hash id).
- `instrument_type`: `PPA`, `UTILITY_PRODUCT`, `REC`, `GO`, `I-REC`, `EAC_OTHER`, or `THERMAL_CERTIFICATE`.
- `market`: balancing authority, ISO, country, or approved market code.
- `registry_name`: certificate registry used for issuance/retirement.
- `registry_account_id`: account that transferred/retired the instrument.
- `serial_numbers`: non-empty array when serial tracking exists.
- `vintage_start_date` and `vintage_end_date` (`YYYY-MM-DD`).
- `retirement_date`, `retirement_reason`, `retirement_beneficiary`.
- `issuer`, `seller`, `buyer`: legal entity names.
- `quantity_kwh`: quantity represented by the instrument.
- `contract_id`: linked supply contract, tariff, or PPA id.
- `ownership_status`: `owned_and_retired`, `owned_not_retired`, `transferred_out`, or `unknown`.
- `evidence_snapshot_id`: immutable evidence snapshot reference.

## Data-quality and factor controls
1. Required factor metadata on each selected factor
- `factor_source_level` (`supplier_specific`, `residual_mix`, `fallback`)
- `factor_source_name`, `factor_version`, `factor_year`, `factor_unit`, `publication_date`

2. Required MB data-quality scoring
- Score each load slice on `completeness`, `temporal_match`, `geographic_match`, `instrument_quality`, `verification_status` (1 best to 5 worst).
- `dq_score = weighted_mean(component_scores)` using immutable configured weights per run.

3. Blocking gates
- Reject matched claims with missing evidence schema fields.
- Reject matched claims where `ownership_status != owned_and_retired`.
- Reject run when `sum(quantity_kwh from retired evidence) < sum(kWh_matched)`.
- Reject rows with unresolved unit conversion.
- Reject MB publication when unmatched load lacks residual mix and approved fallback exception.
- Reject factor usage when `factor_source_level`, factor version, or factor year is missing.

## Scope 1+2 rollups
- `E_scope12_lb_tCO2e = (E_scope1_total_kgCO2e + E_scope2_lb_kgCO2e) / 1000`
- `E_scope12_mb_tCO2e = (E_scope1_total_kgCO2e + E_scope2_mb_kgCO2e) / 1000`

## Required trace fields
- `site_id`, `energy_carrier`, `kWh_load`, `kWh_matched`, `kWh_unmatched`, `factor_source_level`, `factor_id`, `factor_version`, `residual_mix_dataset`, `fallback_exception_id`, `evidence_id`, `evidence_snapshot_id`, `dq_score`, `calculated_kgco2e`.
