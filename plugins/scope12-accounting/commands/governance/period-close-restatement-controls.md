---
name: period-close-restatement-controls
description: Enforce close-period immutability, controlled restatements, and reproducible Scope 1/2 outputs with immutable evidence and factor provenance.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Enforce control-plane rules across Scope 1/2 compute, KPI, and reporting outputs.

## Control rules
1. Period close
- Closed periods are immutable for in-place edits.
- Any correction requires a new restatement version.

2. Restatement metadata requirements
- Required fields:
  - `restatement_id`
  - `restatement_reason`
  - `approved_by`
  - `approved_at`
  - `impacted_periods`
  - `impacted_metrics`
  - `evidence_snapshot_ids` (array of immutable snapshot ids)
  - `scope1_factor_set_version`
  - `scope2_factor_set_version`
  - `gwp_version`
  - `residual_mix_dataset_version`
  - `kpi_method_version`
- Preserve prior snapshots and generate new version IDs for revised outputs.

3. Immutable evidence and factor binding
- Each restatement must bind outputs to exact `evidence_snapshot_ids` used by MB claims.
- `evidence_snapshot_ids` must be content-addressed or hash-verifiable and immutable.
- Factor references must be version-pinned; mutable aliases (for example `latest`) are prohibited.

4. Reproducibility
- Same input snapshots + factor versions + GWP set + evidence snapshot IDs must reproduce same totals.
- Store deterministic run metadata hash for replay validation.

## Validation sequence
1. Validate close state and restatement metadata completeness.
2. Validate evidence snapshot immutability and factor version pinning.
3. Run Scope 1 command.
4. Run Scope 2 command.
5. Run KPI normalization command.
6. Run reporting command.
7. Verify no control violations before final state transition.

## Fail conditions
- Attempted overwrite of closed-period ledger rows.
- Missing restatement approvals.
- Missing or mutable `evidence_snapshot_ids` for restated MB outputs.
- Missing factor set versions or use of non-versioned factor aliases.
- KPI/report values not tied to corresponding compute and evidence snapshot versions.
