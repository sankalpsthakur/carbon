---
name: finance-carbon-ledger-rigor
description: Applies CFO/audit-grade carbon ledger controls with immutable replay, governance-state integrity, and close-period enforcement.
---
Use when:
- A carbon result is being used in finance disclosures or CFO review packs.
- Audit requires line-level reproducibility and governance evidence.

Ledger control workflow:
1. Establish controlled compute run and capture `run_id`.
2. Reconcile `/summary`, `/runs`, and `/summary/as-of`.
3. Verify override and adjustment workflow semantics.
4. Confirm inventory version lineage for compute/override/adjustment events.
5. Close reporting period and verify force-gated recompute behavior.

Evidence requirements:
- Every reported total ties back to append-only compute snapshots (treated as immutable evidence for replay).
- Governance actions are state-valid and traceable to actor/time.
- Replay is deterministic for the same `run_id`.
- Published totals include a `totals_digest_sha256` (SHA-256 over canonical JSON of the required totals-table trace fields). This is not a cryptographic signature.

Hard gates:
1. Mixed units: quantity-derived rows require unit/denominator trace.
2. FX gaps: reporting-currency totals require complete FX evidence.
3. Sparse factors: `none` method must remain <= 2% for close candidates.
4. Replay drift: run totals, summary, and as-of must reconcile exactly (`1e-9` max delta).

Primary command:
- `commands/finance/cfo-carbon-ledger-rigor.md`
