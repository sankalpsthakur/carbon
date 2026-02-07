---
name: ingest-normalization
description: Normalizes uploaded activity rows into compute-ready records and reconciliation metrics used for DQS and gating.
---
Use when:
- Running the ingest quality gate before compute.

Normalization details:
- Coerces spend and quantity columns to numeric.
- Preserves raw row payload in `raw` field.
- Persists normalized shape into `activity_rows` with row index and data-quality flags.
- Adds normalized category and GL-code keys (`category_norm`, `gl_code_norm`) for compute filtering.

Quality outputs:
- Reconciliation with missingness percentages, currency/unit distribution, and validation issue summary.
- Job-level status and errors in `ingestion_jobs`.

APIs:
- `POST /api/ingestion-jobs/upload`
- `GET /api/ingestion-jobs/{job_id}/preview`
- `GET /api/ingestion-jobs/{job_id}/reconciliation`
