---
name: deep-tech-lca-physics
description: Runs engineering-focused Scope 3 modeling with material scoping, supplier primary-data upgrades, and quantity-physics quality gates.
---
Use when:
- Product engineering teams need process- or component-level decarbonization modeling.
- Supply-chain LCA must prioritize measured and unit-consistent physics over pure spend proxies.

Engineering workflow:
1. Scope rows with material IRO filters (`/api/material-iros/upsert`).
2. Upsert measured supplier primary data (`/api/lca/primary-data/upsert`).
3. Ensure quantity-compatible factor coverage for remaining rows.
4. Compute and validate method hierarchy on scoped inventory.
5. Compare scenarios with immutable run replay (`/summary/as-of`).

Physics constraints (hard requirements):
- Functional unit (FU) is required: define one FU per scenario and keep it fixed across comparisons.
- Units must be explicit on any quantity/intensity row (`activity_unit` + factor denominator units), and dimensions must be compatible.
- Conversions require evidence: `from_unit`, `to_unit`, `multiplier`/equation, and a reference; full chain for multi-step conversions.
- Co-product allocation must be explicit when applicable: declare policy (mass/energy/economic/system-expansion) and record basis quantities/values.

Physics-first expectations:
- `supplier_primary` is preferred for measured processes.
- `average_quantity` is required where physical activity data exists and units are compatible.
- `spend` fallback is allowed only as an explicit exception (never silently due to unit/coverage issues).

Hard gates:
1. Functional unit: FU missing/ambiguous, FU drift across scenarios, or rows not convertible to FU => fail closed.
2. Units/conversions: missing units, dimension mismatch, or missing/unevidenced conversion chain => fail closed.
3. Co-product allocation: co-products present without declared policy + basis evidence => fail closed.
4. No silent downshift: physics-critical row downgraded to spend without explicit exception record => fail closed.
5. FX gaps: no reporting-currency normalization gaps in hybrid spend rows.
6. Sparse factors: `supplier_primary + average_quantity` share >= 80% on material-scoped rows.
7. Replay drift: prior scenario runs must remain replay-stable after later model updates.

Primary command:
- `commands/engineering/deep-tech-lca-physics-modeling.md`
