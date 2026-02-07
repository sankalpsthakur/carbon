---
name: scope2-method-rules
description: Detailed formulas, evidence schema, and hard gates for Scope 2 location-based and market-based accounting across electricity and purchased thermal energy.
---
Use when calculating Scope 2 emissions or auditing energy-attribute claims.

## Dual-ledger requirement
Always compute both:
- Location-based total
- Market-based total

## Coverage and conversions
- Include purchased electricity, purchased steam, purchased heat, and purchased cooling.
- Convert activity to canonical units before factor use:
  - `kWh = MWh * 1000`
  - `kWh = GJ * 277.777778`
  - `kWh = MMBtu * 293.071070`

## Core formulas
- `kWh_net_import = max(0, kWh_import - kWh_export)`
- `E_scope2_lb_kgCO2e = E_electricity_lb_kgCO2e + E_steam_lb_kgCO2e + E_heat_lb_kgCO2e + E_cooling_lb_kgCO2e`
- `kWh_matched = min(kWh_load, eligible_contract_or_eac_kWh)`
- `kWh_unmatched = max(0, kWh_load - kWh_matched)`
- `E_scope2_mb_kgCO2e = sum((kWh_matched * EF_contract) + (kWh_unmatched * EF_selected_unmatched))`

## On-site generation and ownership rules
1. Owned on-site self-generation is not purchased Scope 2 activity.
2. Third-party-owned on-site supply consumed by entity is purchased activity.
3. MB claims require owned-and-retired attributes.
4. Attributes sold/transferred-out invalidate matched claims for same kWh.

## Market-based hierarchy
1. Contractual supplier-specific factor with valid evidence.
2. Residual mix factor for uncovered load.
3. Fallback factor only with approved exception when residual mix is unavailable.

## Required evidence schema fields
- `evidence_id`, `instrument_type`, `market`, `registry_name`, `registry_account_id`
- `serial_numbers`, `vintage_start_date`, `vintage_end_date`
- `retirement_date`, `retirement_reason`, `retirement_beneficiary`
- `issuer`, `seller`, `buyer`, `quantity_kwh`, `ownership_status`, `evidence_snapshot_id`

## Blocking conditions
- Any silent fallback in MB factor selection.
- Missing retirement or ownership evidence for matched kWh.
- Unmatched load with no residual mix and no approved fallback exception.
- Missing factor version/year or unresolved unit conversion.
