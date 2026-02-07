---
name: factor-index-search-governance
description: Build and validate factor catalogs, semantic/regex search, and index store compatibility before compute.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Manage factor readiness exactly as compute expects.

Catalog and seed endpoints:
- `POST /api/lca/factors/seed`
- `POST /api/lca/factors/import`
  - Request: `catalog`, `force`, `mode=replace_dataset|append`
  - If factors already exist and `force=false`, returns `409`.
  - Import clears `factor_vectors` to prevent stale index usage.

Index build endpoint:
- `POST /api/lca/factors/index`
- Request: `provider`, `vector_store`, `force`, `dims`
- Valid stores: `mongo`, `chroma`, `pinecone`
- Valid providers: `hashing`, `sentence_transformers` (with runtime checks)

Search endpoint:
- `POST /api/lca/factors/search`
- Request:
  - `q`, `limit`, `mode=regex|semantic`
  - optional `provider`, `vector_store`, `dims`
- Regex mode: regex across `name/category/material/source/keywords`.
- Semantic mode:
  - uses selected store/provider/dims
  - can auto-build index when vectors missing
  - returns `match_score`, `match_provider`, `match_store`, `match_dims`

Compute-facing mapping expectations:
- Candidate list must include `factor_id`, `score`, `name`, `basis`, `denominator_unit`, `source`.
- Default fallback is spend-basis factor when no map found.
- Override factor ids must exist in `factors` or compute loads them explicitly.

Readiness gates:
- Block release if provider/store config causes dimension mismatch, unavailable store, or missing fallback behavior.
