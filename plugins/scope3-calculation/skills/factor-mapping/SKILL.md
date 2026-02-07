---
name: factor-mapping
description: Selects mapped factor and candidate list using regex/semantic search modes, fallback logic, and override precedence.
---
Use when:
- Inventory groups need deterministic factor assignment for compute.

Selection path:
1. Query candidates (semantic or lexical) using factor catalog and optional vectors.
2. Use best candidate id if found.
3. If none found, use default spend factor fallback when available.
4. If approved override exists for ledger key, override mapped factor and candidate order.

Search/index endpoints:
- `POST /api/lca/factors/search`
- `POST /api/lca/factors/index`
- `POST /api/lca/factors/import`
- `POST /api/lca/factors/seed`

Output contract per row:
- `mapped_factor_id`
- `factor_candidates[]` with `factor_id`, `score`, `basis`, `denominator_unit`, `source`
- trace mapping metadata (`search_mode`, `provider`, `dims`, `used_default_fallback`, optional `override`)
