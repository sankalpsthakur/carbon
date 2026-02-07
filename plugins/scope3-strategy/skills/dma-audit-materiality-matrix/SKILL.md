---
name: dma-audit-materiality-matrix
description: Produces DMA-first audit-ready materiality matrices with stakeholder engagement controls, scoring governance, and finalization checks.
---
Use this skill when preparing assurance-ready materiality output.

Workflow:
1. Confirm assessment and IRO register integrity.
2. Attach stakeholder engagement evidence and enforce audit controls:
   - Every material IRO must include at least 2 independent stakeholder evidence links.
   - At least 1 internal and 1 external perspective must exist for each high-severity IRO.
   - Evidence older than 18 months is "stale" unless explicitly justified.
3. Score IROs with confidence tied to evidence diversity and quality.
4. Compute materiality matrix and verify placement consistency with score inputs and evidence references.
5. Reconcile scoring disagreement:
   - Score spread > 3 points between impact and financial dimensions requires adjudication note before matrix approval.
6. Finalize snapshot only when all controls and gates pass.

Hard validation gates (must match `commands/dma/dma-audit-ready-materiality-matrix-stakeholder.md`):
- Respect immutable-state gate: `409 DMA assessment is finalized` blocks all mutation.
- Respect org-assessment alignment gate on IRO create/update (`400 Assessment/org mismatch`).
- Respect evidence dedupe gate (`409 Evidence already attached`).
- Finalize gate blocks when any IRO has zero evidence links.
- Additional assurance gate: block finalization when stakeholder diversity controls are not met even if API-level minimums pass.
- Block matrix approval when adjudication is missing for impact vs financial score spread > 3 points.
- Block finalization when stale evidence (>18 months) is used without explicit justification.

Deliverable:
- Audit-ready matrix dossier containing assessment id, matrix output, stakeholder engagement map, unresolved/closed disagreements, finalization gate decision, and snapshot tuple (`snapshot_id`, `version`, `sha256`).
