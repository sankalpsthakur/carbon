---
name: carbon-calc-jobs
description: List, inspect, and manage calculation jobs using the calc MCP server.
allowed-tools:
  - calc.health
  - calc.db.get
  - calc.db.set
  - calc.db.list
  - calc.db.delete
  - calc.ingest
  - Read
  - Glob
---
Manage calculation jobs stored in the calc MCP server.

## List all jobs

Use `calc.db.list` with `collection: "jobs"` to retrieve all ingestion jobs.
Optionally filter by status: `query: { "status": "DONE" }`.

## Inspect a single job

Use `calc.db.get` with `collection: "jobs"` and `query: { "_id": "<job_id>" }`.

Review these fields:
- `_id` (job ID)
- `filename` (source file)
- `status` (UPLOADED, PARSING, DONE, ERROR)
- `row_count`
- `reporting_currency`
- `reconciliation` (missing counts, flags, spend/quantity totals)
- `created_at`, `updated_at`

## Create a new job

Use `calc.ingest` with:
- `filename`: source file name
- `rows`: array of activity data objects
- `reporting_currency`: optional, defaults to USD

The ingest tool validates data quality, flags missing fields, and produces a reconciliation summary.

## Delete a job

Use `calc.db.delete` with `collection: "jobs"` and `query: { "_id": "<job_id>" }`.
Also clean up related data:
- `calc.db.delete` with `collection: "activity_rows"` and `query: { "job_id": "<job_id>" }`
- `calc.db.delete` with `collection: "inventory_items"` and `query: { "job_id": "<job_id>" }`

## Check server health

Use `calc.health` to confirm the MCP server is running and verify the data directory.
