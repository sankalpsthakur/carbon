---
name: stage1-lifecycle-evidence-snapshot
description: "Execute full Stage 1 DMA lifecycle: assessment, IROs, scoring, matrix, boundary, evidence linking, and snapshot finalization."
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Follow this exact Stage 1 lifecycle.

1. Create or load DMA assessment
- `POST /api/dma/assessments`
- Body: `org_id`, `year`
- Reuses existing `(org_id, year)` assessment if present.

2. Create IRO entries
- `POST /api/dma/iros`
- Body:
  - `assessment_id`, `org_id`, `type` (`impact|risk|opportunity`), `topic`, `title`, `description`

3. Score IRO
- `PUT /api/dma/iros/{iro_id}/score`
- Body:
  - `scores.impact_materiality` (0-10)
  - `scores.financial_materiality` (0-10)
  - `scores.likelihood` (0-10, optional)
  - `confidence` (`low|medium|high`)

4. Add evidence links
- `POST /api/dma/iros/{iro_id}/evidence`
- Body follows `EvidenceLink`:
  - `source_type` required: `regulatory_chunk|uploaded_doc|url|note|stakeholder_evidence|external_doc`
  - Conditional required fields:
    - `regulatory_chunk`: `chunk_id`
    - `uploaded_doc|stakeholder_evidence|external_doc`: `source_id`
    - `url`: valid `http://` or `https://` URL
    - `note`: at least one of `quote` or `notes`
  - For `regulatory_chunk|uploaded_doc|stakeholder_evidence|external_doc`: at least one of `quote|notes|url`

5. Compute matrix
- `POST /api/dma/assessments/{assessment_id}/matrix`

6. Upsert reporting boundary
- `PUT /api/dma/assessments/{assessment_id}/boundary`
- Body:
  - `consolidation_method` (`operational_control|equity_share|financial_control|other`)
  - `units[]` (`unit_type`, `name`, `geography`, `include`, `rationale`)
  - `value_chain_assumptions[]`, `notes`

7. Freeze snapshot
- `POST /api/dma/assessments/{assessment_id}/snapshot`
- Body: `finalize` (bool)
- Snapshot increments `snapshot_version`, stores immutable bundle, and emits `sha256` digest.

Hard validation gates:
- Any mutation endpoint above must fail with `409 DMA assessment is finalized` once assessment status is final.
- `POST /api/dma/iros` must fail with `400 Assessment/org mismatch` if IDs cross org boundaries.
- Evidence attach must fail with `409 Evidence already attached` for dedupe collisions.
- Snapshot finalization (`finalize=true`) must fail with `409` when any IRO has zero `evidence_links`.

Deliverable:
- Stage 1 dossier containing assessment id, IRO ids + scores, evidence coverage matrix, boundary version, snapshot id/version/sha256, and finalize gate result.
