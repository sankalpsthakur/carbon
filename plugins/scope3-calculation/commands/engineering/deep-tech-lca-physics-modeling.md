---
name: deep-tech-lca-physics-modeling
description: Execute deep-tech product and supply-chain physics modeling with material scope filters, primary measurements, and quantity-first method controls.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Run engineering-grade LCA with process-level scoping, physics-aware units, and supplier-primary upgrades.

Physics constraints (must be explicit before compute):
- Units/dimensions:
  - Every quantity-driven or intensity-driven row must carry an explicit unit (`activity_unit` and any factor denominator units).
  - Conversions are allowed only within the same dimension (mass, energy, distance, time, area, volume, count). No implicit cross-dimension conversions.
- Conversions (evidence required):
  - Any conversion must be traceable with: `from_unit`, `to_unit`, `multiplier` (and/or equation), and an evidence reference (vendor spec, engineering calc, standard).
  - Multi-step conversions must include the full ordered chain; missing any step fails closed.
- Functional unit (FU):
  - Define exactly one FU for the scenario (amount + unit + delivered function). All per-unit intensities must be convertible to the FU.
  - FU cannot change across scenario comparisons; a changed FU is a different study, not a new run.
- Co-product allocation hook:
  - If a modeled process yields co-products, you must declare an allocation policy (mass, energy, economic, or system-expansion) and record the basis quantities/values used.
  - No default allocation: if allocation is required and unspecified, fail closed.

Execution flow:
1. Scope engineering-relevant inventory segments
- `POST /api/material-iros/upsert` for each target `gl_code` and/or `category`.
- `GET /api/material-iros?job_id=...` to verify active material scope.
- Compute will include only matching rows when material IRO filters exist.

2. Upsert measured supplier primary data
- `POST /api/lca/primary-data/upsert` with either:
  - `emissions_total_kgco2e`, or
  - `kgco2e_per_unit` + `activity_unit`.
- Repeat for critical vendors/components until primary coverage target is met.

3. Build factor depth for non-primary remainder
- `POST /api/lca/factors/import` or `/api/lca/factors/seed`.
- `POST /api/lca/factors/index` and spot-check `/api/lca/factors/search` for quantity-basis candidates.

4. Compute and inspect physics-oriented method distribution
- `POST /api/lca/compute` with `{ "job_id": "...", "refresh": true, "force": false }`
- `GET /api/lca/summary?job_id=...`
- `GET /api/lca/inventory?job_id=...&limit=500&sort=dqs_desc`
- Verify high-impact rows prefer:
  - `supplier_primary` (measured)
  - `average_quantity` (unit-compatible factor)
  - then `spend` fallback only where quantity physics is unavailable.

5. Engineering screenshot packet
- `GET /api/lca/hotspots?job_id=...&impact_basis=emissions_total_kgco2e&pareto_cutoff=0.8`
- `GET /api/lca/gaps?job_id=...&impact_basis=emissions_total_kgco2e&max_dqs=0.7`
- Capture top physics-critical rows with trace evidence for:
  - primary data source
  - unit conversion path (if any)
  - mapping candidates and selected factor.

6. Replay and scenario integrity
- Use summary `run_id` and call `GET /api/lca/summary/as-of?job_id=...&run_id=...`.
- Preserve prior run IDs and totals as immutable scenario checkpoints.

Hard gates (must fail closed):
1. Functional unit gate
- Fail if FU is missing/ambiguous, or if compared scenarios use different FUs.
- Fail if any quantity/intensity row cannot be expressed in the FU (no conversion path).

2. Units/dimensions + conversion evidence gate
- Fail if any quantity-based or primary-intensity row lacks explicit units or uses dimension-incompatible units.
- Fail if a conversion is required but its chain is missing, ambiguous, or lacks evidence (`from_unit`, `to_unit`, `multiplier`/equation, reference).

3. Co-product allocation gate
- Fail if any co-product process lacks an explicit allocation policy and documented basis quantities/values.

4. No silent downshift gate
- Fail if a physics-critical row is downgraded to `spend` due to unit/factor gaps without an explicit exception record (actor, reason, and evidence).

5. FX gaps gate
- If reporting currency normalization is active, fail compute on missing FX pairs before publishing engineering comparisons.

6. Sparse factors gate
- Within material-IRO-scoped rows, fail if combined `supplier_primary + average_quantity` share is below `0.80`.
- Fail if quantity-compatible factors are absent for key engineering categories after factor search/index checks.

7. Replay drift gate
- Fail if previous run replay (`/summary/as-of`) changes after newer primary-data upserts or recomputes.
- Fail if scenario totals cannot be reproduced exactly from compute snapshots.

Deliverable:
- Deep-tech engineering screenshot packet with:
  - functional unit + allocation policy statement (if applicable)
  - method split on scoped rows
  - primary-data coverage and upgrade impact
  - unit-conversion evidence
  - immutable scenario comparison with hard-gate status.
