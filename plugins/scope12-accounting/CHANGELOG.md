---
name: scope12-accounting-changelog
description: Version history for scope12-accounting.
---
# Changelog

## 0.1.1 - 2026-02-06
- Hardened `workflows:scope12-accounting:scope2-calculate-location-market` with purchased steam/heat/cooling formulas, explicit unit conversions, on-site generation/export ownership logic, strict MB evidence schema, and no-silent-fallback residual mix controls.
- Hardened `workflows:scope12-accounting:scope1-calculate-ledger` with biogenic CO2 separation, explicit non-CO2 gas/GWP handling, and factor/data-quality hierarchy gates.
- Hardened `workflows:scope12-accounting:normalize-scope12-intensity-kpis` with rebasing triggers, constant-currency and deflator normalization, consolidation-boundary alignment, and partial-period controls.
- Hardened `workflows:scope12-accounting:publish-scope12-report-pack` with mandatory MB coverage table, evidence ID disclosure, and MB claim quality grading requirements.
- Hardened `workflows:scope12-accounting:period-close-restatement-controls` with immutable evidence snapshot ID and factor-version restatement binding.
- Updated Scope 1/2/KPI/reporting skills and all local planning/architecture/coverage docs to match hardened controls.

## 0.1.0 - 2026-02-06
- Created plugin scaffold with valid `.claude-plugin/plugin.json`.
- Added command set for Scope 1 calculation, Scope 2 dual method accounting, KPI normalization, reporting pack generation, and close controls.
- Added accounting agents and skill packs with concrete formulas and method selection rules.
- Added `CASE_COVERAGE.md` with capability mapping and edge-case gates.
- Added implementation docs (`Prompt.md`, `Plans.md`, `Architecture.md`, `Implement.md`, `Documentation.md`).
