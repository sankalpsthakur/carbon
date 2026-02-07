---
name: pipeline-execution
description: Lock-aware orchestration for Measure seeding, disclosure ingestion, benchmark seeding, and recommendation generation.
---
# Pipeline Execution Skill

Use for end-to-end or stage-isolated backend pipeline runs.

Canonical endpoint order:
1. `POST /api/measure/seed`
2. `POST /api/pipeline/sources/seed` or `POST /api/pipeline/sources/register`
3. `POST /api/pipeline/download` (for https registered sources)
4. `POST /api/pipeline/ingest`
5. `POST /api/seed-data`
6. `POST /api/pipeline/generate`

Alternative single-trigger flow:
- `POST /api/pipeline/run` executes the same lifecycle and tracks run status in `pipeline_runs`.

Control requirements:
- Always check/reporting period lock before mutations; locked state must stop execution with `423`.
- Treat rate-limit `429` as control signal, not data corruption.
- Confirm audit events for each completed stage.

Success criteria:
- pipeline run completes (`success`) or precise failed stage isolated
- admin metrics show updated `last_pipeline_run`
- generated recommendations stored or explicitly skipped for leader/no-context cases
