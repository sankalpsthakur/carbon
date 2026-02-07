---
name: hotspots-campaigns
description: Produces vendor hotspot Pareto analysis, high-impact low-DQS gap ranking, and collection campaign snapshots.
---
Use when:
- Prioritizing supplier engagement based on computed inventory impact and data quality.

Hotspots:
- Endpoint: `GET /api/lca/hotspots`
- Supports `impact_basis=emissions_total_kgco2e|spend_total`.
- Computes per-vendor share and cumulative share; stops at configured Pareto cutoff.

Gaps:
- Endpoint: `GET /api/lca/gaps`
- Filters by `impact_total` threshold and `dqs <= max_dqs`.
- Ranks by `gap_score = impact_total * (1 - dqs)`.

Campaign creation:
- Endpoint: `POST /api/lca/collection-campaigns/create`
- Snapshots selected gap rows and criteria into campaign record.
- Requires existing inventory rows from a compute run.

Campaign retrieval:
- `GET /api/lca/collection-campaigns`
- `GET /api/lca/collection-campaigns/{campaign_id}`
