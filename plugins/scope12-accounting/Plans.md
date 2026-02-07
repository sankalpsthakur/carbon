---
name: scope12-plan
description: Milestone plan and validations for enterprise-hardening the Scope 1/2 accounting plugin.
---
# Plans

## Milestones
1. Harden Scope 2 compute controls for purchased thermal coverage, ownership logic, and evidence schema.
2. Harden Scope 1 compute controls for biogenic separation, gas-level GWP mapping, and factor/data-quality hierarchy gates.
3. Harden KPI normalization controls for rebasing triggers, currency/deflator comparability, and boundary/partial-period alignment.
4. Harden reporting outputs for MB coverage tables, evidence IDs, and claim-quality disclosures.
5. Harden governance controls for immutable evidence snapshot and factor-version bound restatements.
6. Align skills and documentation artifacts to the hardened command behavior.

## Validation checklist
- Every command markdown has valid YAML frontmatter with `name`, `description`, and `allowed-tools`.
- Scope 2 command includes purchased electricity/steam/heat/cooling formulas and deterministic unit conversion rules.
- Scope 2 MB logic explicitly enforces residual mix before fallback and prohibits silent fallback.
- Scope 1 command separates biogenic CO2 disclosure and enforces non-CO2 gas GWP requirements.
- KPI command enforces rebasing triggers, constant-currency and deflator normalization, and partial-period controls.
- Reporting command enforces mandatory MB coverage table with evidence IDs and claim quality grading.
- Governance command requires immutable `evidence_snapshot_ids` plus version-pinned factor metadata for restatements.
