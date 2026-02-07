---
name: verify-execution-readiness
description: Verify encryption prerequisites, period-lock state, and endpoint health before executing pipeline, OCR, or reporting commands.
allowed-tools:
  - Bash
  - Read
  - Grep
---
Run this readiness gate before any write-heavy execution flow.

Checklist:
1. Health surface.
- `GET /api/health` must return `200` with `{"status":"healthy"}`.
2. Storage and OCR prerequisites.
- `DOCSTORE_KEY` required for `POST /api/pipeline/docs/upload`.
- `EMERGENT_LLM_KEY` optional for OCR quality; without it `/api/execution/ocr` must still return fallback pseudo-blocks.
3. Reporting period lock state.
- `GET /api/execution/reporting-period-locks` for target `period`.
- If period is `locked`, mark all mutating operations as blocked (`423` expected).
4. Baseline endpoint accessibility.
- Must be reachable for planned run:
  - `/api/pipeline/run`
  - `/api/pipeline/sources/seed` or `/api/pipeline/sources/register`
  - `/api/pipeline/ingest`
  - `/api/pipeline/generate`
  - `/api/measure/overview`
  - `/api/quality/anomalies/run`
  - `/api/admin/audit`

Return:
- `go` or `no-go`
- blocking prerequisites with exact missing env/endpoint
- expected lock/rate-limit constraints for the upcoming run
