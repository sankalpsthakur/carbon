---
name: run-ocr-pass
description: Execute OCR extraction plus field-level provenance attachment using render, OCR blocks, and provenance endpoints.
allowed-tools:
  - Bash
  - Read
---
Execute the evidence OCR workflow in this order.

Document and render stage:
1. Ensure doc exists from one of:
- `POST /api/pipeline/docs/upload` (PDF only, encrypted storage), or
- seeded docs from source seeding.
2. Render page: `POST /api/execution/render-pdf-page` with `doc_id`, `page_number`, `zoom`.
3. Optionally persist rendered page: `POST /api/execution/render-and-store-page`.

OCR stage:
1. Run OCR: `POST /api/execution/ocr` with `image_base64`, `mime_type`, optional `doc_id/page_number`.
2. Validate input guardrails:
- short/invalid base64 -> `400 image_base64 must be a valid base64-encoded PNG/JPEG/WEBP`
- rate limit >12/min -> `429 Rate limit exceeded`
3. Retrieve blocks for overlays: `GET /api/execution/ocr-blocks?doc_id=...&page_number=...`.

OCR confidence thresholds (numeric):
- Treat missing `confidence` as `0.0`.
- For any field-level citation/provenance, compute:
  - `ocr_confidence_min = min(confidence)` across referenced OCR blocks.
- Thresholds:
  - `OCR_CONF_STRONG >= 0.90`: eligible for downstream automated survey suppression if provenance is complete.
  - `OCR_CONF_REVIEW` in `[0.75, 0.90)`: manual review required; do not suppress based on this evidence.
  - `OCR_CONF_LOW < 0.75`: treat as unresolved evidence; do not suppress.

Provenance stage:
1. Create record: `POST /api/execution/field-provenance`.
2. Required field validation:
- `entity_type`, `entity_id`, `field_key`, `doc_id` required
- `page_number >= 1`
3. `bbox` validation rules:
- list length 4, numeric, finite, non-negative
- `x1 > x0`, `y1 > y0`
- if page dimensions known, bbox must be within bounds
4. `ocr_block_ids` validation rules:
- all IDs must exist
- all IDs must match same `doc_id` + `page_number`
5. Verify linkage: `GET /api/execution/field-provenance?entity_type=...&entity_id=...`.

Acceptance criteria:
- OCR returns non-empty `blocks` or deterministic fallback blocks.
- Provenance write succeeds and can be re-listed for same entity.
- Audit events include `execution.ocr` and `execution.field_provenance.create`.
- Suppression eligibility rule:
  - Only `OCR_CONF_STRONG` evidence should be used to justify survey suppression.
  - `OCR_CONF_REVIEW` and `OCR_CONF_LOW` evidence must not suppress; route to manual review / keep survey active.
