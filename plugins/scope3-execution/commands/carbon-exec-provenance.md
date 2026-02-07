---
name: carbon-exec-provenance
description: Manage field-level provenance links between data fields and source documents with OCR evidence.
allowed-tools:
  - mcp__exec-local__exec.provenance.save
  - mcp__exec-local__exec.provenance.list
  - mcp__exec-local__exec.provenance.delete
  - mcp__exec-local__exec.ocr
  - mcp__exec-local__exec.db.get
---
Use this command to create, inspect, and manage provenance records that link emission data fields back to their source documents.

## Available operations

1. **OCR a source document**:
   - `exec.ocr` with `file_path` (PDF, image, or scanned document).
   - Returns extracted text blocks with bounding-box coordinates and a confidence score (0-1).

2. **Save a provenance link**:
   - `exec.provenance.save` with `field`, `collection`, `record_id`, `source_doc`, `excerpt`, and optional `confidence`.
   - Stores a link from a specific data field (e.g. `scope1_total`) to the exact excerpt in the source document.

3. **List provenance records**:
   - `exec.provenance.list` with optional `collection`, `record_id`, or `field` filters.
   - Returns all matching provenance entries with their source document references and confidence scores.

4. **Delete a provenance link**:
   - `exec.provenance.delete` with `provenance_id`.
   - Removes a single provenance record.

5. **Lookup the linked record**:
   - `exec.db.get` with `collection` and `query: { _id: "<record_id>" }` to view the data record a provenance entry points to.

## DB collections involved

| Collection    | Purpose                                      |
|---------------|----------------------------------------------|
| provenance    | Field-level evidence links to source docs    |
| documents     | Ingested source documents (PDF, invoice, etc)|
| emissions     | Emission records referenced by provenance    |
| suppliers     | Supplier records referenced by provenance    |

## Workflow

1. Run `exec.ocr` on a source document to extract text with confidence scores.
2. Identify the relevant excerpt that supports a data field value.
3. Use `exec.provenance.save` to create the link between the field and the excerpt.
4. Verify with `exec.provenance.list` filtered by `record_id` to confirm the link is stored.
5. Use `exec.provenance.delete` to remove any incorrect or superseded links.
