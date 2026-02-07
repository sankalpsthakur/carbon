# CASE_COVERAGE

## Capability Mapping

| Capability | Command | Skill | Agent | Primary Screenshot Output |
| --- | --- | --- | --- | --- |
| Spend-based rapid baseline inventory | `commands/baseline/spend-rapid-baseline-screenshot.md` | `skills/spend-rapid-baseline/SKILL.md` | `agents/spend-baseline-operator.md` | Spend hotspots + low-DQS gaps + method mix baseline packet |
| Finance-grade carbon ledger rigor/traceability (CFO/audit) | `commands/finance/cfo-carbon-ledger-rigor.md` | `skills/finance-carbon-ledger-rigor/SKILL.md` | `agents/cfo-ledger-auditor.md` | CFO ledger packet (summary/run-history/as-of reconciliation + governance evidence + SHA-256 totals digest) |
| Deep-tech LCA engineering + supply-chain physics modeling | `commands/engineering/deep-tech-lca-physics-modeling.md` | `skills/deep-tech-lca-physics/SKILL.md` | `agents/deep-tech-lca-engineer.md` | Engineering packet (primary coverage, quantity conversion evidence, scenario replay) |

## Hard Edge-Case Gates

| Gate | Spend Baseline | Finance Ledger | Deep-Tech Physics |
| --- | --- | --- | --- |
| Functional unit | N/A | N/A | Fail if FU is missing/ambiguous, drifts across scenarios, or rows are not convertible to FU. |
| Mixed units | Fail if `average_quantity` rows have incompatible denominator units with no conversion trace. | Fail if quantity-derived rows lack unit and conversion evidence in trace. | Fail if any quantity/intensity row lacks explicit units or uses dimension-incompatible units on scoped rows. |
| Conversion evidence | N/A | N/A | Fail if conversion chain lacks `from_unit`, `to_unit`, multiplier/equation, or evidence reference for any step. |
| Co-product allocation | N/A | N/A | Fail if co-products are present but allocation policy + basis evidence is not declared. |
| No silent downshift | Fail if method downgrade is not explicit in row trace evidence. | Fail if method downgrade is not explicit in row trace evidence. | Fail if physics-critical rows downgrade to `spend` without an explicit exception record. |
| FX gaps | Fail closed on compute `409 Missing FX rates to normalize spend`. | Fail if reporting-currency totals cannot be fully FX-reconciled to row trace evidence. | Fail on missing FX pairs when hybrid spend + quantity scenarios are normalized to reporting currency. |
| Sparse factors | Fail if `method=none` share exceeds 5% of inventory rows or mapped factor coverage is incomplete for non-`none` rows. | Fail if `method=none` share exceeds 2% for close candidates or approved override factor IDs are unresolved. | Fail if `supplier_primary + average_quantity` share is below 80% on material-IRO-scoped rows. |
| Replay drift | Fail if `/summary` and `/summary/as-of` differ for same `run_id` beyond `1e-9`. | Fail if summary/run-history/as-of totals cannot be reconstructed exactly from compute snapshots. | Fail if prior scenario `/summary/as-of` values drift after newer runs or primary-data updates. |

## Gate Enforcement Rules

1. No partial publication: if any gate fails, block packet publication for that capability.
2. No silent fallback: any method downgrade must be explicit in row trace (`mapping`, `method`, `dqs` sections).
3. Deterministic replay: run-level totals must be reproducible from immutable `inventory_item_versions` compute snapshots.
4. Documented exceptions: any accepted exception requires explicit actor, reason, and evidence in override/adjustment records.
