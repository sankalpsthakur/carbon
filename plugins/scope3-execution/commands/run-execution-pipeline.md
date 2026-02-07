---
name: run-execution-pipeline
description: Run lock-aware pipeline orchestration using exact backend stage endpoints and validate each stage outcome.
allowed-tools:
  - Bash
  - Read
---
Orchestrate the execution pipeline with explicit stage checks.

Preferred full-run endpoint:
1. `POST /api/pipeline/run?period=<period>`
- Success response includes `run_id` and message `Pipeline run complete`.
- This internally runs:
  - `POST /api/measure/seed`
  - `POST /api/pipeline/sources/seed`
  - `POST /api/pipeline/ingest`
  - `POST /api/seed-data`
  - `POST /api/pipeline/generate`

Granular fallback runbook (when isolating failures):
1. Baseline measure seed: `POST /api/measure/seed`
2. Source setup:
- seed route: `POST /api/pipeline/sources/seed`, or
- registration route: `POST /api/pipeline/sources/register` (must be `https://...pdf` only)
3. Optional source fetch for registered URLs: `POST /api/pipeline/download`
4. Chunking/indexing: `POST /api/pipeline/ingest`
5. Benchmark/evidence seed: `POST /api/seed-data`
6. Recommendation generation: `POST /api/pipeline/generate`

Validation criteria per stage:
- Respect reporting period locks: if locked, expect `423` and stop.
- Source register rejects non-https/non-PDF URLs with `400`.
- Download/ingest/generate respect rate limits (`3`, `6`, `4` per minute); `429` must be treated as retry-later, not data failure.
- Generation should return `generated >= 0`; if `0`, capture reason from seeded data state.

Post-run checks:
- `GET /api/admin/metrics` includes updated `last_pipeline_run`.
- `GET /api/admin/audit` includes `pipeline.ingest` and `pipeline.generate` events.
