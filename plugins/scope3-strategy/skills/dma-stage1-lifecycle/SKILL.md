---
name: dma-stage1-lifecycle
description: Runs full DMA Stage 1 lifecycle including evidence linking and snapshot finalization readiness.
---
Use this skill for Stage 1 assurance-grade DMA execution.

Workflow:
1. Create/load assessment: `POST /api/dma/assessments`.
2. Add IROs: `POST /api/dma/iros`.
3. Score IROs: `PUT /api/dma/iros/{iro_id}/score`.
4. Attach evidence: `POST /api/dma/iros/{iro_id}/evidence`.
5. Compute matrix and boundary.
6. Create snapshot: `POST /api/dma/assessments/{assessment_id}/snapshot`.

Validation gates:
- Mutations blocked when assessment is final (`409 DMA assessment is finalized`).
- Evidence schema must satisfy source-type rules and dedupe checks.
- Finalize snapshot requires evidence on every IRO (`409 Cannot finalize...missing evidence links`).

Deliverable:
- Stage 1 package with IRO register, evidence coverage, matrix status, boundary payload, and snapshot digest.
