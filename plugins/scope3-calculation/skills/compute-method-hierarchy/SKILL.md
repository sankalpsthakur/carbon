---
name: compute-method-hierarchy
description: Computes inventory emissions with supplier-primary, quantity, and spend hierarchy plus FX normalization and factor candidate mapping.
---
Use when:
- Running or validating `/api/lca/compute` behavior.

Method order:
1. `supplier_primary`
2. `average_quantity`
3. `spend`
4. `none`

Formulas:
- Quantity: `emissions = quantity_total_converted * factor_kgco2e_per_unit`
- Spend: `emissions = spend_used * factor_kgco2e_per_unit`
- tCO2e: `total_emissions_tco2e = total_emissions_kgco2e / 1000`

DQS coupling:
- `final_dqs = clamp(0.7 * base_dqs + 0.3 * method_score, 0, 1)`

Dependencies:
- Factors must exist (`seed` or `import`).
- Reporting currency compute requires all FX pairs.
- Material IRO rows (if configured) scope the compute input set.

Persistence behavior:
- Writes compute snapshots to `inventory_item_versions`.
- Replaces current view in `inventory_items`.
- Updates `lca_runs` pointer and appends `lca_run_history`.
