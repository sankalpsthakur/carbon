---
name: carbon-connect-ingest-from
description: Ingest data from a named source through its mapping config and create a calculation job.
allowed-tools:
  - connectors.health
  - connectors.list
  - connectors.map
  - connectors.ingest
  - connectors.validate
  - connectors.preview
  - connectors.db.get
  - connectors.db.set
  - calc.ingest
  - Read
  - Glob
---
Usage: `/carbon:connect:ingest-from <source> [--file <path>] [--mapping <config>]`

## Parameters
- `source`: Source system name (e.g. sap-s4hana, xero, quickbooks, generic-csv)
- `--file <path>`: Path to data file (CSV, JSON, Excel export)
- `--mapping <config>`: Override mapping config name (default: auto-detect from source)

## Workflow

1. Resolve the mapping config:
   - If `--mapping` provided, use that config name
   - Otherwise use `source` as the config name
   - Run `connectors.list` to verify config exists

2. Load data:
   - If `--file` provided, read the file and parse rows
   - For CSV: parse comma/semicolon delimited with header row
   - For JSON: expect array of objects or { data: [...] } wrapper
   - For Excel: use generic-excel config with sheet_name detection

3. Validate before transforming:
   - Run `connectors.validate` on the raw rows
   - Report field completeness summary
   - If >50% required fields missing, stop and report

4. Preview mapping:
   - Run `connectors.preview` with first 5 rows
   - Show user the canonical output for confirmation

5. Full ingestion:
   - Run `connectors.ingest` to transform all rows
   - Pass resulting `activity_rows` to `calc.ingest`
   - Report job_id, row counts, and reconciliation summary

## Examples
```
/carbon:connect:ingest-from sap-s4hana --file ./exports/po_items_2024.json
/carbon:connect:ingest-from xero --file ./downloads/xero_bills.csv
/carbon:connect:ingest-from generic-csv --file ./data/procurement_data.csv
/carbon:connect:ingest-from brex-ramp --file ./exports/brex_transactions.json
```
