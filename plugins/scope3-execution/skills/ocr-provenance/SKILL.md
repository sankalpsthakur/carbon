---
name: ocr-provenance
description: Runs OCR rendering, extraction, and field-level provenance attachment for evidence-backed execution flows.
---
Use this skill to validate evidence extraction and provenance integrity.

Primary flow:
1. Render page image (`POST /api/execution/render-pdf-page` or `/api/execution/render-and-store-page`).
2. Extract OCR blocks (`POST /api/execution/ocr`).
3. Retrieve blocks (`GET /api/execution/ocr-blocks`).
4. Attach provenance (`POST /api/execution/field-provenance`).
5. Verify stored provenance (`GET /api/execution/field-provenance`).

Validation gates:
- Keep `(doc_id, page_number)` constant through render -> OCR -> provenance chain.
- OCR response must include `blocks` and non-empty `raw_text`.
- Provenance payload must include stable `field_key` and valid `bbox`.
- Stored provenance entries must reference existing OCR blocks.

OCR confidence thresholds:
- Treat missing `confidence` as `0.0`.
- For a field’s supporting OCR blocks, compute `ocr_confidence_min = min(confidence)` across the blocks.
- Thresholds:
  - `OCR_CONF_STRONG >= 0.90`: eligible for automated suppression decisions (if provenance linkage is complete).
  - `OCR_CONF_REVIEW` in `[0.75, 0.90)`: manual review required; do not suppress based on this evidence.
  - `OCR_CONF_LOW < 0.75`: treat as unresolved evidence; do not suppress.

Outputs:
- OCR run summary with block counts and extraction status.
- Provenance attachment report with field-level evidence IDs and `ocr_confidence_min` classification (`strong|review|low`).
