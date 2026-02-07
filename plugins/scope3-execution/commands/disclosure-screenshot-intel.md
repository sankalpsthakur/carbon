---
name: disclosure-screenshot-intel
description: Ingest public disclosures, render screenshot evidence, and extract score signals so suppliers with strong public data can skip redundant surveys.
allowed-tools:
  - Bash
  - Read
  - Grep
---
Run this disclosure-first sequence before sending surveys.

Objective:
- Minimize supplier survey fatigue by harvesting public disclosure evidence first.

Sequence:
1. Register public PDF sources with `POST /api/pipeline/sources/register`.
- Require `https://...pdf` URLs only.
- Use one source per `(company_id, category)` minimum.
2. Download registered disclosures via `POST /api/pipeline/download`.
3. Ingest disclosure content via `POST /api/pipeline/ingest`.
4. Build recommendation evidence via `POST /api/pipeline/generate`.
5. Enumerate docs with `GET /api/pipeline/docs`.
6. Capture page screenshots for scoring fields:
- `POST /api/execution/render-and-store-page` (preferred, stores reusable page image).
- Optional retrieval: `GET /api/execution/document-pages` and `GET /api/execution/document-pages/image`.
7. Extract OCR blocks from screenshot payload with `POST /api/execution/ocr`.
8. Validate OCR overlays with `GET /api/execution/ocr-blocks`.
9. Attach extracted score evidence using `POST /api/execution/field-provenance` on relevant benchmark fields:
- `field_key` targets: `cee_rating`, `supplier_intensity`, `peer_intensity`, `potential_reduction_pct`, `upstream_impact_pct`.
10. Pull supplier readiness with `GET /api/suppliers/{supplier_id}/deep-dive`.
11. Classify survey suppression:
- suppress survey only when all hard gates pass (below).
- otherwise keep survey active (or route to manual review), and record explicit blockers.

`source_docs` / `source_citations` contract (required for suppression):
- `source_docs`: array of documents used as evidence.
  - `doc_id` (string, required): internal document id from `GET /api/pipeline/docs`.
  - `url` (string, required): canonical public URL (must be `https://...` for public sources).
  - `evidence_snapshot_id` (string, required, 64 hex): deterministic snapshot id.
  - `sha256` (string, optional, 64 hex): content hash if available.
  - `retrieved_at` (string, optional, ISO8601).
- `source_citations`: array of field-level citations derived from screenshots/OCR.
  - `evidence_id` (string, optional): server-side evidence/citation id if provided by storage.
  - `evidence_snapshot_id` (string, required, 64 hex): deterministic snapshot id.
  - `doc_id` (string, required)
  - `url` (string, optional; when present must match the `source_docs` url for the same `doc_id`)
  - `page_number` (integer, required; 1-based)
  - `bbox` (array[4] number, required): `[x0, y0, x1, y1]` in rendered page pixel coords.
  - `excerpt` (string, required; <=200 chars): exact OCR excerpt that supports the field.
  - `ocr_confidence_min` (number, required; 0..1): minimum confidence across referenced OCR blocks (missing confidence => 0.0).
  - `ocr_block_ids` (array[string], recommended): OCR block ids supporting the excerpt.
  - `provenance` (object, required):
    - `entity_type` (string, required)
    - `entity_id` (string, required)
    - `field_key` (string, required)
    - `field_provenance_id` (string, optional): id returned by `POST /api/execution/field-provenance`.

Deterministic `evidence_snapshot_id` (v1):
- `source_docs[].evidence_snapshot_id = sha256_hex("source_doc|v1|doc_id=<doc_id>|url=<url>|sha256=<sha256>")`
- `source_citations[].evidence_snapshot_id = sha256_hex("source_citation|v1|doc_id=<doc_id>|page=<page_number>|bbox=<x0,y0,x1,y1>|field_key=<field_key>|excerpt=<excerpt_canon>")`
- `excerpt_canon`: NFKC, trim, lowercase, collapse whitespace.
- Use MCP tool `exec.sha256` to generate these IDs deterministically.

Hard gates for survey suppression:
1. Deep-dive evidence status:
- `content.evidence_status` must be `ok`.
2. Document presence:
- `source_docs.length >= 1`.
3. Citation presence:
- `source_citations.length >= 1`.
4. Field provenance linkage:
- For each suppressing field key, at least one `source_citations[]` item must exist with matching `provenance.field_key`.
- Each such citation must reference a `doc_id` + `page_number` that matches an existing `field-provenance` record for that field (`GET /api/execution/field-provenance`).
5. OCR confidence thresholds:
- `OCR_CONF_STRONG >= 0.90`: suppression allowed only if each suppressing field has at least one citation with `ocr_confidence_min >= 0.90`.
- `OCR_CONF_REVIEW` in `[0.75, 0.90)`: route to manual review (`needs_manual_review`) and do not suppress.
- `OCR_CONF_LOW < 0.75` or confidence missing: treat as unresolved evidence and do not suppress.

Edge-case controls:
1. Missing docs:
- If `GET /api/pipeline/docs` is empty after download/ingest, record blocker `missing_docs`.
- Run `POST /api/quality/anomalies/run` and inspect `pipeline.source_not_downloaded`.
- Route supplier to targeted survey queue.
2. Low-confidence OCR:
- If OCR blocks are empty OR any suppressing-field citation fails `OCR_CONF_STRONG`, mark `needs_manual_review` and add blocker `low_confidence_ocr`.
- Never suppress survey for that supplier until provenance is manually confirmed with strong-confidence citations.
3. Duplicate suppliers:
- Deduplicate by `supplier_id` first; if duplicates share IDs, keep latest evidence-rich record.
- If duplicate names map to different IDs, keep both and require explicit canonical mapping in output.

Required output:
- Supplier-level table with:
  - `supplier_id`
  - `evidence_status`
  - `source_docs[]` and `source_citations[]` (per schemas above)
  - `provenance_fields` count
  - survey decision (`suppress|request|manual_review`)
  - blocker list
