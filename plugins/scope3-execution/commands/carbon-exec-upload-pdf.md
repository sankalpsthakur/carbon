---
name: carbon-exec-upload-pdf
description: Upload and register PDF documents in the execution store for downstream OCR and provenance linking.
allowed-tools:
  - mcp__exec-local__exec.upload_pdf
  - mcp__exec-local__exec.db.list
  - mcp__exec-local__exec.db.get
---
Use this command to register PDF documents in the execution database.

## Upload a PDF

Call `exec.upload_pdf` with:
- `filename` (required) -- Original filename, e.g. "acme-sustainability-2024.pdf".
- `title` (optional) -- Human-readable title. Defaults to filename.
- `company_id` (optional) -- Owning company or supplier ID for linkage.
- `category` (optional) -- Document category. Common values:
  - `sustainability_report`
  - `cdp_response`
  - `annual_report`
  - `lca_study`
  - `general`

Returns the new `doc_id` and full document record.

## What happens on upload

1. A document record is created in the `documents` collection.
2. The document is marked `ingested: false`.
3. Running the pipeline `ingest` stage (or `exec.pipeline.run`) will mark it as ingested.
4. Once ingested, the document is available for `exec.render_page` and `exec.ocr`.

## Listing documents

- `exec.db.list { collection: "documents" }` -- all documents.
- `exec.db.list { collection: "documents", query: { company_id: "..." } }` -- by company.
- `exec.db.get { collection: "documents", query: { _id: "<doc_id>" } }` -- single doc.

## DB collection

| Collection | Key fields                                                   |
|------------|--------------------------------------------------------------|
| documents  | _id, filename, title, company_id, category, ingested, uploaded_at |
