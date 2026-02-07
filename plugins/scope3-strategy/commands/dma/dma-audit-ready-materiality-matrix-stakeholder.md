---
name: dma-audit-ready-materiality-matrix-stakeholder
description: Execute DMA-first audit-ready materiality matrix with stakeholder engagement evidence, scoring governance, and finalization controls.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Execute this flow when preparing screenshot-ready evidence of audit-grade DMA operation.

Execution sequence:
1. Load assessment + IRO baseline
- Confirm assessment via `POST /api/dma/assessments` (`org_id`, `year`).
- Load active IRO list and verify each IRO has explicit type/topic/title completeness.

2. Run stakeholder engagement capture
- Capture stakeholder-derived evidence using `POST /api/dma/iros/{iro_id}/evidence`.
- Require representation across internal and external voices:
  - Internal examples: operations, procurement, finance, compliance.
  - External examples: customers, suppliers, lenders/investors, regulators, civil society.

3. Calibrate and score IROs
- Update scores with `PUT /api/dma/iros/{iro_id}/score`:
  - `scores.impact_materiality`, `scores.financial_materiality`, optional `scores.likelihood`.
  - `confidence` only raised to `high` when evidence diversity and quality criteria are met.

4. Generate and verify matrix
- `POST /api/dma/assessments/{assessment_id}/matrix`.
- Validate matrix placement against score inputs and stakeholder evidence references.

5. Close assurance loop
- Reconcile unresolved scoring disagreement.
- Reconfirm boundary (`PUT /api/dma/assessments/{assessment_id}/boundary`).
- Attempt snapshot finalization via `POST /api/dma/assessments/{assessment_id}/snapshot` with `finalize=true` only if all controls pass.

Audit-specific controls:
- Every material IRO must include at least 2 independent stakeholder evidence links.
- At least 1 internal and 1 external perspective must exist for each high-severity IRO.
- Score spread > 3 points between impact and financial dimensions requires adjudication note before matrix approval.
- Evidence older than 18 months is "stale" unless explicitly justified.

Hard validation gates:
- Respect immutable-state gate: `409 DMA assessment is finalized` blocks all mutation.
- Respect org-assessment alignment gate on IRO create/update (`400 Assessment/org mismatch`).
- Respect evidence dedupe gate (`409 Evidence already attached`).
- Finalize gate blocks when any IRO has zero evidence links.
- Additional assurance gate: block finalization when stakeholder diversity controls are not met even if API-level minimums pass.

Deliverable:
- Audit-ready matrix dossier containing assessment id, matrix output, stakeholder engagement map, unresolved/closed disagreements, finalization gate decision, and snapshot tuple (`snapshot_id`, `version`, `sha256`).
