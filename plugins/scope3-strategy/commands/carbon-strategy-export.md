---
name: carbon-strategy-export
description: Export DMA assessment data as JSON or evidence pack with SHA256 integrity seal.
allowed-tools:
  - mcp__strategy-local__strategy.export
  - mcp__strategy-local__strategy.db.get
---
Use this command to export strategy and DMA assessment data for external reporting or audit purposes.

## Available operations

1. **Export data**:
   - `strategy.export` with `format` (one of `json`, `evidence_pack`) and optional `iro_id` to scope to a single IRO.
   - Returns the exported payload or a file path for the evidence pack.

2. **Preview a specific record**:
   - `strategy.db.get` with `collection` and `query` to inspect individual records before exporting.

## Format options

| Format          | Output                                                                 |
|-----------------|------------------------------------------------------------------------|
| `json`          | Full JSON dump of DMA topics, IROs, stakeholder assessments, and risk signals with metadata. |
| `evidence_pack` | Organised directory structure grouped by IRO, each containing linked source documents, provenance excerpts, and stakeholder input. |

## Integrity seal

Both formats include a SHA256 integrity seal:

- **`json`**: A `_seal` field at the root containing the SHA256 hash of the serialised payload (excluding the seal itself).
- **`evidence_pack`**: A `manifest.json` at the pack root listing every file with its SHA256 hash, plus a top-level seal over the manifest.

This allows auditors to verify that exported data has not been tampered with after generation.

## DB collections involved

| Collection           | Purpose                                      |
|----------------------|----------------------------------------------|
| dma_topics           | Double Materiality Assessment topics         |
| iros                 | Impact, Risk, Opportunity records            |
| stakeholder_inputs   | Stakeholder assessment responses             |
| risk_signals         | External risk signals linked to IROs         |

## Workflow

1. Use `strategy.db.get` to preview the records you want to export.
2. Call `strategy.export` with `format: "json"` for a full data dump, or `format: "evidence_pack"` for an audit-ready package.
3. Optionally scope the export to a single IRO with `iro_id`.
4. Verify the SHA256 seal against the exported content to confirm integrity.
