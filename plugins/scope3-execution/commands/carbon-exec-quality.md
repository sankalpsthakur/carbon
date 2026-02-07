---
name: carbon-exec-quality
description: Run quality gates and compute supplier maturity scorecards.
allowed-tools:
  - mcp__exec-local__exec.quality_gates
  - mcp__exec-local__exec.maturity_score
  - mcp__exec-local__exec.db.list
---
Use this command to validate data completeness through quality gates and assess supplier maturity levels.

## Available operations

1. **Run quality gates**:
   - `exec.quality_gates` with no arguments (runs all gates) or optional `gate` to run a single gate by name.
   - Returns pass/fail status for each gate with details on failures.

2. **Compute maturity score**:
   - `exec.maturity_score` with `supplier_id` to calculate the M0-M4 maturity level for a specific supplier.
   - Returns the level, contributing factors, and improvement recommendations.

3. **List records for inspection**:
   - `exec.db.list` with `collection` to review the underlying data that gates and scores evaluate.

## Quality gates

| Gate                    | Check                                                      |
|-------------------------|------------------------------------------------------------|
| `pipeline_complete`     | All emission pipeline stages (ingest, map, calculate) are finished. |
| `suppliers_exist`       | At least one supplier record exists in the DB.             |
| `factors_loaded`        | Emission factors collection is populated and version-tagged.|
| `no_orphan_provenance`  | Every provenance record references a valid source document. |
| `docs_ingested`         | At least one document has been ingested via OCR.           |

## Maturity levels

| Level | Name          | Criteria                                                    |
|-------|---------------|-------------------------------------------------------------|
| M0    | Unknown       | No data or engagement for the supplier.                     |
| M1    | Estimated     | Emissions estimated from spend or industry averages.        |
| M2    | Reported      | Supplier self-reported data available.                      |
| M3    | Verified      | Provenance links exist with confidence >= 0.8.             |
| M4    | Assured       | Third-party assurance evidence on file.                     |

## Workflow

1. Run `exec.quality_gates` to get the overall readiness status.
2. For any failing gate, use `exec.db.list` on the relevant collection to diagnose the gap.
3. Once gates pass, run `exec.maturity_score` for individual suppliers to generate scorecards.
4. Target suppliers at M0-M1 for engagement to improve data quality.
