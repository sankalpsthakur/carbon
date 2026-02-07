---
name: carbon-exec-suppliers
description: Query, filter, and visualise supplier data using the exec MCP server DB and heatmap tools.
allowed-tools:
  - mcp__exec-local__exec.suppliers.list
  - mcp__exec-local__exec.suppliers.heatmap
  - mcp__exec-local__exec.db.get
  - mcp__exec-local__exec.db.list
  - mcp__exec-local__exec.maturity_score
---
Use this command to explore the supplier universe stored in the execution DB.

## Available operations

1. **List suppliers** (optionally filtered):
   - `exec.suppliers.list` with optional `category`, `rating` (A-E), `min_impact` (numeric threshold for upstream_impact_pct).
   - Returns matching supplier records with all stored fields.

2. **Heatmap**:
   - `exec.suppliers.heatmap` produces a category-by-rating matrix with supplier counts.
   - Useful for identifying concentration risk or coverage gaps.

3. **Single supplier lookup**:
   - `exec.db.get` with `collection: "suppliers"` and `query: { _id: "<supplier_id>" }`.

4. **Maturity score**:
   - `exec.maturity_score` with `supplier_id` computes the M0-M4 maturity level based on evidence, provenance, and engagement status.

## DB collections involved

| Collection    | Purpose                            |
|---------------|------------------------------------|
| suppliers     | Core supplier records              |
| engagements   | Engagement status per supplier     |
| provenance    | Field-level evidence links         |

## Workflow

1. Start with `exec.suppliers.list` to get the full or filtered list.
2. For any supplier of interest, drill into `exec.maturity_score` to see their scorecard.
3. Use `exec.suppliers.heatmap` to get an aggregate view by category and rating.
