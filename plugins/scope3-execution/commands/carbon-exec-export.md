---
name: carbon-exec-export
description: Export execution data in CSRD, GHG Protocol, PDF, or JSON format.
allowed-tools:
  - mcp__exec-local__exec.export
  - mcp__exec-local__exec.db.list
---
Use this command to export execution data into standardised reporting formats.

## Available operations

1. **Export data**:
   - `exec.export` with `format` (one of `csrd`, `ghg`, `pdf`, `json`) and optional `filters` (date range, scope, category).
   - Returns the exported payload or a file path for binary formats.

2. **Preview available data**:
   - `exec.db.list` with `collection` set to `emissions`, `suppliers`, or `engagements` to review what will be included in the export.

## Format options

| Format | Output                                                        |
|--------|---------------------------------------------------------------|
| `csrd` | ESRS-aligned sections: E1 (Climate), S2 (Workers in value chain), G1 (Governance). Includes DMA cross-references. |
| `ghg`  | GHG Protocol breakdown: Scope 1 (direct), Scope 2 (energy indirect), Scope 3 (value chain) with category subtotals. |
| `pdf`  | Manifest PDF with summary tables, charts, and provenance appendix. Returns a file path. |
| `json` | Raw JSON dump of all execution collections with metadata and timestamps. |

## DB collections involved

| Collection    | Purpose                                |
|---------------|----------------------------------------|
| emissions     | Emission records by scope and category |
| suppliers     | Supplier data for value chain sections |
| engagements   | Engagement status for CSRD disclosure  |
| provenance    | Evidence links included in appendices  |

## Workflow

1. Use `exec.db.list` to preview the data that will be exported.
2. Call `exec.export` with the desired `format`.
3. For `csrd` or `ghg`, review the structured output sections.
4. For `pdf`, retrieve the file at the returned path.
5. For `json`, use the raw payload for downstream integrations.
