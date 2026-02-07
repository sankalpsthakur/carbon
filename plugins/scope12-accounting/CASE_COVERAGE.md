---
name: scope12-case-coverage
description: Capability mapping for Scope 1/2 accounting plugin with command, agent, skill linkage and enterprise edge-case coverage.
---
# CASE_COVERAGE

## Capability Mapping

| Capability | Command | Agent | Skill |
| --- | --- | --- | --- |
| Scope 1 direct emissions ledger with biogenic/non-biogenic split and GWP controls | `commands/compute/scope1-calculate-ledger.md` | `agents/scope1-ledger-engineer.md` | `skills/scope1-method-rules/SKILL.md` |
| Scope 2 dual accounting for purchased electricity, steam, heat, and cooling | `commands/compute/scope2-calculate-location-market.md` | `agents/scope2-energy-attribute-analyst.md` | `skills/scope2-method-rules/SKILL.md` |
| Normalized KPI generation with rebasing, boundary alignment, and constant-currency controls | `commands/kpi/normalize-scope12-intensity-kpis.md` | `agents/kpi-normalization-auditor.md` | `skills/kpi-normalization-rules/SKILL.md` |
| Publishable Scope 1/2 reporting pack with MB coverage and claim quality disclosure | `commands/reporting/publish-scope12-report-pack.md` | `agents/reporting-pack-controller.md` | `skills/reporting-assurance-rules/SKILL.md` |
| End-to-end controlled run (compute -> KPI -> report -> close controls) | `commands/governance/period-close-restatement-controls.md` | `agents/scope12-accounting-orchestrator.md` | `skills/reporting-assurance-rules/SKILL.md` |

## Edge Cases and Hard Gates

| Edge Case | Rule | Owning Command |
| --- | --- | --- |
| Biogenic fuel use mixed with fossil fuel | Report biogenic CO2 separately; include non-CO2 gases in Scope 1 total; never net biogenic CO2 into Scope 1 total. | `commands/compute/scope1-calculate-ledger.md` |
| Non-CO2 gas appears without GWP mapping | Block row calculation; no default GWP substitution. | `commands/compute/scope1-calculate-ledger.md` |
| Refrigerant mass-balance yields negative leak | Require approved exception record; otherwise fail close. | `commands/compute/scope1-calculate-ledger.md` |
| Purchased steam/heat/cooling provided in non-kWh units | Convert using mandated deterministic factors before applying EF; unresolved conversion blocks run. | `commands/compute/scope2-calculate-location-market.md` |
| On-site generation exported while attributes are sold | Exported or transferred attributes cannot be used for matched MB claims; reclassify as unmatched load. | `commands/compute/scope2-calculate-location-market.md` |
| Residual mix unavailable for unmatched MB load | Fallback allowed only with approved exception; otherwise fail run. | `commands/compute/scope2-calculate-location-market.md` |
| MB claim lacks required registry/serial/vintage/retirement metadata | Reject matched claim and block publication. | `commands/compute/scope2-calculate-location-market.md` |
| KPI denominator boundary differs from emissions boundary | Block KPI publication until boundaries align. | `commands/kpi/normalize-scope12-intensity-kpis.md` |
| M&A or method/factor changes impact base year | Trigger mandatory rebasing and full historical recomputation of impacted series. | `commands/kpi/normalize-scope12-intensity-kpis.md` |
| Partial-period entities lack active-day coverage metadata | Block KPI publication. | `commands/kpi/normalize-scope12-intensity-kpis.md` |
| MB report excludes matched/unmatched coverage table or evidence IDs | Block report publication. | `commands/reporting/publish-scope12-report-pack.md` |
| Restatement metadata missing evidence snapshot ids or factor versions | Block restatement approval and report release. | `commands/governance/period-close-restatement-controls.md` |

## Global Gate Rules
1. No silent method fallback: all factor hierarchy outcomes must be explicitly logged.
2. No report publication with unresolved blocking validation errors.
3. Restatements must preserve immutable prior snapshots and produce a new version id.
4. Market-based claims require auditable evidence linkage, immutable snapshot IDs, and claim-quality disclosure.
