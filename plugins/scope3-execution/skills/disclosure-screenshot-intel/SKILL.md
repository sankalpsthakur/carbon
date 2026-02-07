---
name: disclosure-screenshot-intel
description: Uses disclosure ingestion plus screenshot OCR provenance to derive public supplier scores and reduce unnecessary survey requests.
---
Use this skill when you want disclosure-first data collection before surveys.

Workflow:
1. Register public sources:
- `POST /api/pipeline/sources/register`
2. Download and ingest disclosures:
- `POST /api/pipeline/download`
- `POST /api/pipeline/ingest`
3. Generate evidence-backed recommendations:
- `POST /api/pipeline/generate`
4. Capture screenshot evidence:
- `POST /api/execution/render-and-store-page`
- `POST /api/execution/ocr`
- `GET /api/execution/ocr-blocks`
5. Attach score provenance:
- `POST /api/execution/field-provenance`
6. Check supplier readiness:
- `GET /api/suppliers/{supplier_id}/deep-dive`

Suppression policy:
- Suppress survey only when all hard gates pass:
  - `content.evidence_status=ok`
  - `source_docs.length >= 1` and `source_citations.length >= 1`
  - each suppressing `field_key` has linked `field-provenance` plus at least one strong-confidence citation
  - OCR confidence meets thresholds below

`source_docs` / `source_citations` contract (for suppression):
- `source_docs[]` requires: `doc_id`, `url`, `evidence_snapshot_id` (sha256 v1).
- `source_citations[]` requires: `doc_id`, `page_number`, `bbox`, `excerpt`, `ocr_confidence_min`, `evidence_snapshot_id`, and `provenance.{entity_type,entity_id,field_key}`.
- Deterministic `evidence_snapshot_id` (v1) uses `sha256_hex(...)`; use MCP tool `exec.sha256`.

OCR confidence thresholds:
- `OCR_CONF_STRONG >= 0.90`: eligible for suppression (per-field, at least one citation per field meets this).
- `OCR_CONF_REVIEW` in `[0.75, 0.90)`: manual review required; do not suppress.
- `OCR_CONF_LOW < 0.75` or confidence missing: treat as unresolved evidence; do not suppress.

Edge-case behavior:
- Missing docs: keep survey active and raise blocker.
- Low-confidence OCR: route to manual review and block suppression until strong-confidence citations exist.
- Duplicate suppliers: deduplicate by `supplier_id`, never by name alone.

Required output:
- `supplier_id` to decision map with rationale, blockers, and `source_docs/source_citations` evidence bundle.
