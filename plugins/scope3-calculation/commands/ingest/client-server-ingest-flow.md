---
name: client-server-ingest-flow
description: Execute the exact ingest lifecycle from upload through reconciliation and preview using the backend API contract.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Run the ingestion flow exactly as implemented in `backend/server.py`:

1. Upload raw file
- Endpoint: `POST /api/ingestion-jobs/upload`
- Content type: `multipart/form-data`
- Fields:
  - `file` (required, `.csv` or `.xlsx`; `.xls` is rejected)
  - `column_map` (optional JSON string)
  - `reporting_currency` (optional)
- Validation behavior:
  - Reject unsupported type with `415`
  - Reject oversize payload with `413` (`MAX_UPLOAD_MB`)
  - Parse failure returns `400`
  - Missing required mapped columns (`vendor`, `description`, `spend`, `currency`) returns `400`

2. Confirm async ingestion state transitions
- `UPLOADED -> PARSING -> DONE` on success
- `ERROR` on parse/schema failure
- Job model fields include `column_map`, `row_count`, `errors`, `reconciliation`, `reporting_currency`.

3. Verify normalized activity rows
- Endpoint: `GET /api/ingestion-jobs/{job_id}/preview?limit=25&offset=0`
- Rows come from `activity_rows` with normalized fields:
  - `vendor`, `item_description`, `gl_code`, `category`
  - `spend_original`, `currency_original`, `quantity`, `unit`
  - `data_quality_flags`

4. Validate reconciliation output
- Endpoint: `GET /api/ingestion-jobs/{job_id}/reconciliation`
- Required reconciliation blocks:
  - `missing`, `missing_pct`, `currencies`, `units`, `distinct_counts`
  - `flags`, `rows_with_any_flag`, `rows_clean`, `validation`, `spend_total`, `quantity_total`

5. Use the PRD alias when needed
- `POST /api/lca/ingest` is an alias to upload and must behave identically.

Required ingest flags to track in reports:
- `MISSING_VENDOR`
- `MISSING_DESCRIPTION`
- `MISSING_SPEND`
- `MISSING_CURRENCY`
- `MISSING_QUANTITY`
- `MISSING_UNIT`

Deliverable:
- Produce an ingest checkpoint with `job_id`, status, row counts, required-column mapping, and reconciliation summary suitable for compute gating.
