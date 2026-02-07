---
name: carbon-connect-preview
description: Preview what mapped data would look like for a source file without persisting anything.
allowed-tools:
  - connectors.list
  - connectors.preview
  - connectors.validate
  - Read
  - Glob
---
Usage: `/carbon:connect:preview <source> --file <path> [--limit <n>]`

## Parameters
- `source`: Source system name (e.g. sap-s4hana, xero, generic-csv)
- `--file <path>`: Path to data file
- `--limit <n>`: Number of rows to preview (default 5)

## Workflow

1. Load the mapping config for the given source via `connectors.list`.
2. Read the file and parse the first N rows.
3. Run `connectors.preview` with the source rows.
4. Display side-by-side comparison:
   - Original source fields and values
   - Canonical mapped fields and values
   - Any warnings or transform notes
5. Run `connectors.validate` on the same rows.
6. Report field completeness and potential issues.

## Output format
```
Preview: sap-s4hana (5 rows)

Row 1:
  Source: { Supplier: "ACME Corp", NetPriceAmount: 1500.00, DocumentCurrency: "USD", ... }
  Mapped: { vendor: "ACME Corp", amount: 1500.00, currency: "USD", ... }

Validation Summary:
  Clean rows: 4/5
  Issues: Row 3 - missing MaterialGroup (category will be null)
```
