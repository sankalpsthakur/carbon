---
name: cfo-carbon-ledger-rigor
description: Enforce CFO/audit-grade carbon ledger controls with immutable run replay, governance lineage, and trace-complete evidence snapshots.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Run finance-grade carbon accounting controls with ledger-style reproducibility.

Execution flow:
1. Establish controlled run baseline
- `POST /api/lca/compute` with `{ "job_id": "...", "refresh": true, "force": false }` unless an approved run already exists.
- `GET /api/lca/summary?job_id=...` and capture `run_id`.

2. Build ledger evidence packet
- `GET /api/lca/runs?job_id=...&limit=50`
- `GET /api/lca/summary/as-of?job_id=...&run_id=...`
- `GET /api/lca/inventory/versions?job_id=...&limit=200`
- `GET /api/lca/overrides?job_id=...&limit=200`
- `GET /api/lca/adjustments?job_id=...&limit=200`

3. Validate governance segregation
- Overrides:
  - created via `/api/lca/overrides/create`
  - reviewed once via `/api/lca/overrides/review`
  - lifecycle is exactly `pending -> approved|rejected`.
- Adjustments:
  - created via `/api/lca/adjustments/create`
  - restricted to `emissions_total_kgco2e` and/or `dqs` restatements.
  - no factor/method override allowed in adjustment payload.

4. Freeze reporting period and prove lock behavior
- `POST /api/lca/period/close` with `job_id`, optional `run_id`, and close notes.
- Re-run `POST /api/lca/compute` with `refresh=true, force=false` and confirm closed-period `409`.

5. Publish finance screenshot
- Snapshot totals and method mix from:
  - current summary
  - run-history record
  - as-of replay
- Include event lineage counts by `event_type` in `inventory_item_versions`.

Hard gates (must fail closed):
1. Mixed units gate
- Fail if quantity-driven rows (`supplier_primary` from intensity or `average_quantity`) lack unit context in trace when inventory and denominator/activity units differ.
- Accepted only with explicit conversion metadata.

2. FX gaps gate
- If reporting currency is used, fail if any spend-contributing row lacks FX trace evidence (`rates_used` coverage) or if compute surfaced FX missing-rate errors.

3. Sparse factors gate
- Fail if `methodology_counts.none / inventory_item_count > 0.02` for finance close candidates.
- Fail if approved overrides reference missing `mapped_factor_id` in factor catalog.

4. Replay drift gate
- Fail if `/summary` and `/summary/as-of` differ for the same `run_id` beyond `1e-9` on emissions or spend totals.
- Fail if run-history totals for that `run_id` cannot be reconstructed from compute snapshots (`event_type=compute`, `event_id=run_id`).

Deliverable:
- CFO carbon ledger screenshot packet containing:
  - hash-digested totals table (current vs as-of vs run-history)
    - Digest algorithm: SHA-256 over UTF-8 bytes, encoded as lowercase hex.
    - Canonicalization: construct a JSON object containing only the required fields, recursively sort keys lexicographically, then hash the UTF-8 bytes of the minified JSON string (no extra whitespace).
    - Required trace fields in the digest input:
      - `job_id`, `run_id`
      - `reporting_period_start`, `reporting_period_end`
      - `reporting_currency` (and any reporting-currency normalization mode flags)
      - Totals for each view (`current`, `as_of`, `run_history`):
        - `emissions_total_kgco2e`
        - `spend_total` (if applicable)
        - `inventory_item_count`
      - `methodology_counts` for each view (at minimum: `supplier_primary`, `average_quantity`, `spend`, `none`)
    - Record the resulting `totals_digest_sha256` in the packet and in period-close notes. This is not a cryptographic signature.
  - override/adjustment lineage summary
  - period-close control evidence
  - explicit hard-gate pass/fail outcomes.
