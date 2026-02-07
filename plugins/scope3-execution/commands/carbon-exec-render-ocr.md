---
name: carbon-exec-render-ocr
description: Render PDF pages and run OCR to extract text blocks with confidence scores for downstream provenance.
allowed-tools:
  - mcp__exec-local__exec.render_page
  - mcp__exec-local__exec.ocr
  - mcp__exec-local__exec.db.get
  - mcp__exec-local__exec.db.list
---
Use this command to render and OCR document pages.

## Render a page

Call `exec.render_page` with:
- `doc_id` (required) -- Document ID from `documents` collection.
- `page_number` (required) -- 1-based page number.
- `zoom` (optional) -- Zoom factor, default 1.0.

Returns render metadata (dimensions, render ID). In local mode this is simulated -- no actual image is produced.

## Run OCR

Call `exec.ocr` with:
- `doc_id` (required) -- Document ID.
- `page_number` (required) -- 1-based page number.

Returns an array of text blocks, each with:
- `block_id` -- Unique identifier for the block.
- `text` -- Extracted text content.
- `confidence` -- OCR confidence score (0.0 to 1.0).
- `bbox` -- Bounding box [x0, y0, x1, y1].

OCR blocks are persisted in the `ocr_blocks` collection for provenance linking.

## Confidence thresholds

| Threshold         | Range        | Action                              |
|-------------------|--------------|-------------------------------------|
| OCR_CONF_STRONG   | >= 0.90      | Eligible for automated suppression  |
| OCR_CONF_REVIEW   | [0.75, 0.90) | Manual review required              |
| OCR_CONF_LOW      | < 0.75       | Unresolved -- do not suppress       |

## Typical workflow

1. Upload a PDF: `exec.upload_pdf { filename: "report.pdf" }`.
2. Get the doc_id from the response.
3. Render: `exec.render_page { doc_id: "...", page_number: 1 }`.
4. OCR: `exec.ocr { doc_id: "...", page_number: 1 }`.
5. Use the returned `block_id` values in `exec.provenance.save` to link evidence.

## DB collections

| Collection  | Purpose                            |
|-------------|------------------------------------|
| documents   | Source document records             |
| renders     | Render metadata per page           |
| ocr_blocks  | Extracted text blocks with bbox    |
