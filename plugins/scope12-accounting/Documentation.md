---
name: scope12-documentation
description: Decision log and milestone status for enterprise-hardening the Scope 1/2 accounting plugin.
---
# Documentation

## Status
- Milestone 1: complete
- Milestone 2: complete
- Milestone 3: complete
- Milestone 4: complete
- Milestone 5: complete
- Milestone 6: complete

## Key decisions
- Scope 2 now covers purchased electricity plus purchased steam/heat/cooling with canonical unit conversion requirements.
- Market-based claims require strict evidence schema compliance, ownership-and-retirement proof, and immutable `evidence_snapshot_id` linkage.
- Residual mix precedes fallback by rule; fallback requires explicit approved exception and logged trace metadata.
- Scope 1 biogenic CO2 is separated from Scope 1 totals while non-CO2 gases are always converted by gas-specific GWPs in a locked GWP version.
- KPI trends require rebasing when structural or methodological triggers occur, with constant-currency and deflator normalization for revenue KPIs.
- Reporting now requires MB matched/unmatched coverage tables, evidence IDs, and explicit MB claim-quality grading.
- Restatements are now version-pinned to evidence snapshots and factor set versions to guarantee reproducibility.

## Formula baseline
- `Scope1_total_kgCO2e = E_stationary_fossil + E_mobile + E_process + E_fugitive`
- `Scope1_biogenic_CO2_kg = E_stationary_biogenic_CO2 + E_process_biogenic_CO2`
- `Scope2_LB_kgCO2e = E_electricity_lb_kgCO2e + E_steam_lb_kgCO2e + E_heat_lb_kgCO2e + E_cooling_lb_kgCO2e`
- `Scope2_MB_kgCO2e = sum((kWh_matched * EF_contract) + (kWh_unmatched * EF_selected_unmatched))`
- `Scope12_MB_tCO2e = (Scope1_total_kgCO2e + Scope2_MB_kgCO2e) / 1000`
