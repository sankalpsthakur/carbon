---
name: supplier-maturity-scorecards
description: Derives maturity scorecards from supplier deep-dive evidence and enforces standardized engagement language for consistent supplier outreach.
---
Use this skill to score supplier maturity and normalize engagement updates.

Core data pulls:
1. `GET /api/suppliers`
2. `GET /api/suppliers/{supplier_id}/deep-dive`
3. `GET /api/engagements/{supplier_id}`
4. Optional evidence checks:
- `GET /api/execution/field-provenance`

Scoring:
- Assign one level from `M0_unverified` to `M4_commitment_recorded`.
- Use only observed deep-dive evidence and engagement states.

Standardized note policy:
- Every engagement note starts with:
  `MaturityScorecard::<level>::`.
- Persist updates through:
  `PUT /api/engagements/{supplier_id}`.

Edge-case policy:
- Missing docs: score cannot exceed `M0_unverified`.
- Low-confidence OCR evidence: cap at `M1_partial_evidence` until validated.
- Duplicate suppliers: flag name collisions across IDs, then require canonical ID selection.

Output:
- Scorecard table with maturity level, engagement status, and standardized note used.
