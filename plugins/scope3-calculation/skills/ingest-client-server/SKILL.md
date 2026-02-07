---
name: ingest-client-server
description: Implements the exact client-server ingestion contract including file validation, column mapping, row normalization, and reconciliation retrieval.
---
Use when:
- A new activity file must be ingested and validated before compute.

Core endpoints:
- `POST /api/ingestion-jobs/upload`
- `POST /api/lca/ingest` (alias)
- `GET /api/ingestion-jobs`
- `GET /api/ingestion-jobs/{job_id}`
- `GET /api/ingestion-jobs/{job_id}/preview`
- `GET /api/ingestion-jobs/{job_id}/reconciliation`

Implementation notes:
- Required mapped columns: `vendor`, `description`, `spend`, `currency`.
- Accepted files: `.csv`, `.xlsx` (`.xls` rejected).
- Flags emitted per row: missing vendor/description/spend/currency/quantity/unit.
- Reconciliation is persisted on ingestion job and can be recomputed if absent.

Done criteria:
- Job status `DONE`.
- Preview row count aligns with `job.row_count`.
- Reconciliation payload is available and non-empty.
