---
name: carbon-strategy-matrix
description: Generate and analyze the materiality matrix and ESRS sequencing from scored IROs.
allowed-tools:
  - mcp__strategy-local__strategy.materiality_matrix
  - mcp__strategy-local__strategy.esrs_sequence
  - mcp__strategy-local__strategy.assessment.get
  - mcp__strategy-local__strategy.iro.list
  - mcp__strategy-local__strategy.snapshot
  - Read
  - Write
---
Use this flow to generate the materiality matrix and compute ESRS disclosure sequencing.

Execution sequence:

1. Pre-check
- Call `strategy.assessment.get` to confirm the assessment exists.
- Call `strategy.iro.list` to verify that IROs are scored. Unscored IROs will be excluded from the matrix.

2. Generate materiality matrix
- Call `strategy.materiality_matrix` with `assessment_id`.
- The matrix classifies each scored IRO into quadrants:
  - **material**: impact_materiality >= 3 AND financial_materiality >= 3
  - **impact_only**: impact_materiality >= 3 AND financial_materiality < 3
  - **financial_only**: financial_materiality >= 3 AND impact_materiality < 3
  - **not_material**: both < 3
- IROs within each quadrant are sorted by combined score (descending).

3. Compute ESRS sequencing
- Call `strategy.esrs_sequence` with `assessment_id`.
- Groups IROs by ESRS topic (E1-E5, S1-S4, G1) and orders by materiality.
- Material topics appear first, sorted by combined score.
- Identifies which ESRS standards require disclosure.

4. Validate and snapshot
- Review the matrix for anomalies (e.g., high-impact topics with no financial materiality).
- Check that score spread > 3 between dimensions has been adjudicated.
- Call `strategy.snapshot` to preserve the matrix state.

Interpretation guide:
- Material quadrant (top-right): mandatory ESRS disclosure, highest stakeholder attention.
- Impact-only (top-left): consider voluntary disclosure, monitor for financial escalation.
- Financial-only (bottom-right): investor-focused disclosure, may lack social license.
- Not material (bottom-left): monitor only, document exclusion rationale.

Deliverable:
- Materiality matrix with quadrant placements, ESRS sequencing with disclosure priority order, and optional snapshot for audit trail.
