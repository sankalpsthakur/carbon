---
name: compute-method-hierarchy
description: Run and audit `/api/lca/compute` with exact method-selection hierarchy, mapping behavior, and emissions formulas.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Execute compute in the same order and formulas as `backend/server.py` + `backend/lca_calculators.py`.

Primary endpoint:
- `POST /api/lca/compute`
- Body: `{ "job_id": "...", "refresh": false, "force": false }`

Preconditions and guards:
- Job must exist and be `status=DONE`.
- If period is closed (`closed_at` or `closed_run_id`) and `force=false`, compute returns `409`.
- If inventory already exists and `refresh=false`, endpoint returns existing totals instead of recomputing.

Method hierarchy per inventory group (`vendor`, `item_description`):
1. `supplier_primary`
- Use `primary_data.emissions_total_kgco2e` when present.
- Else use `quantity_total * primary_data.kgco2e_per_unit`.
- If units differ and conversion is unambiguous, convert quantity first with `_convert_quantity`.

2. `average_quantity`
- Requires quantity-compatible mapped factor (`basis=quantity` and compatible denominator unit).
- Formula:
  - `emissions_total_kgco2e = quantity_total_converted * factor_kgco2e_per_unit`

3. `spend`
- Requires spend-compatible mapped factor (`basis=spend`).
- Use reporting-currency spend when available, otherwise original spend.
- Formula:
  - `emissions_total_kgco2e = spend_used * factor_kgco2e_per_unit`

4. `none`
- Default when no usable method applies.

Mapping behavior:
- Candidate mapping comes from `_map_factor_candidates` (semantic/lexical, env-driven provider/store).
- Fallback: first spend-based factor if no candidate is found.
- Approved override (latest by `ledger_key`) replaces mapped factor and is inserted as top candidate.

FX normalization:
- If `reporting_currency` is set on job, compute requires rates for each source currency.
- Missing FX pair causes `409` with required currencies.

Compute outputs to validate:
- `run_id`, `inventory_item_count`, `total_spend`, `total_spend_reporting`, `reporting_currency_used`
- `total_emissions_kgco2e`, `total_emissions_tco2e` (`kg / 1000`)
- `methodology_counts`

Persistence invariants:
- Immutable snapshot rows in `inventory_item_versions` with `event_type=compute`, `event_id=run_id`.
- Current view replaced in `inventory_items`.
- Latest pointer in `lca_runs`; append-only history in `lca_run_history`.
