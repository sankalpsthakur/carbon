---
name: supplier-maturity-scorecards
description: Build supplier maturity scorecards from deep-dive evidence and apply standardized engagement language through deterministic status updates.
allowed-tools:
  - Bash
  - Read
  - Grep
---
Use this command to create maturity scorecards with consistent outreach text.

Inputs:
- `GET /api/suppliers`
- `GET /api/suppliers/{supplier_id}/deep-dive`
- `GET /api/engagements/{supplier_id}`
- Optional evidence overlays: `GET /api/execution/field-provenance?entity_type=supplier_benchmark&entity_id=<benchmark_id>`

Scorecard rubric (deterministic):
1. `M0_unverified`
- no disclosure evidence (`evidence_status=missing_public_report`) and no provenance on core fields.
2. `M1_partial_evidence`
- `evidence_status=insufficient_context` or partial provenance only.
3. `M2_evidence_ready`
- `evidence_status=ok` with cited source docs, but engagement not yet active.
4. `M3_engagement_active`
- `evidence_status=ok` and engagement `in_progress|pending_response`.
5. `M4_commitment_recorded`
- engagement `completed` with standardized commitment note.

Standardized engagement language (required note prefix):
- Prefix every note with `MaturityScorecard::<level>::`.
- `M0_unverified`: `MaturityScorecard::M0_unverified::Public evidence missing. Please provide your latest category-specific disclosure and baseline data.`
- `M1_partial_evidence`: `MaturityScorecard::M1_partial_evidence::Current disclosures are incomplete for validated scoring. Please provide missing activity and intensity fields.`
- `M2_evidence_ready`: `MaturityScorecard::M2_evidence_ready::Public disclosures identified. Confirm ownership and timeline for reduction actions.`
- `M3_engagement_active`: `MaturityScorecard::M3_engagement_active::Action plan review in progress. Please validate milestones and reporting cadence.`
- `M4_commitment_recorded`: `MaturityScorecard::M4_commitment_recorded::Commitment captured. Continue periodic progress submission per agreed cadence.`

Writeback:
1. Update status and note via `PUT /api/engagements/{supplier_id}` using accepted states:
- `not_started`, `in_progress`, `pending_response`, `completed`, `on_hold`.
2. Set `next_action_date` (ISO date) on all non-completed suppliers.

Data hygiene:
1. Duplicate suppliers:
- If same `supplier_id` appears multiple times, keep highest `upstream_impact_pct` record.
- If same `supplier_name` maps to different IDs, emit `duplicate_name_conflict` and avoid cross-ID overwrite.
2. Missing docs:
- downgrade to `M0_unverified`, status `pending_response`.
3. Low-confidence OCR evidence:
- downgrade one level (for example `M2` -> `M1`) until manual evidence validation is complete.

Required output:
- Scorecard table: `supplier_id`, `supplier_name`, `cee_rating`, maturity level, engagement status, standardized note hash, next action date.
