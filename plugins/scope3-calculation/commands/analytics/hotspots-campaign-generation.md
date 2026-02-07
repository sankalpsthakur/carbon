---
name: hotspots-campaign-generation
description: Generate hotspot and gap outputs, then snapshot collection campaigns from high-impact low-DQS inventory rows.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Run analytics using the exact pipeline behavior in `server.py`.

Hotspots endpoint:
- `GET /api/lca/hotspots?job_id=...&pareto_cutoff=0.8&limit=50&impact_basis=emissions_total_kgco2e|spend_total`
- Grouping key: `vendor`
- `impact_total` basis:
  - emissions mode: `emissions_total_kgco2e`
  - spend mode: `spend_total_reporting` fallback `spend_total`
- Metrics:
  - `share = impact_total / total_impact`
  - `cumulative_share = running sum of share`
  - `dqs_weighted = weighted_dqs_num / weighted_dqs_den`
    - numerator: `sum(dqs * impact_total)`
    - denominator: `sum(impact_total)`
- Return vendors until `cumulative_share >= pareto_cutoff`.

Gaps endpoint:
- `GET /api/lca/gaps?job_id=...&min_spend=...&min_emissions_kgco2e=...&max_dqs=0.6&limit=50&impact_basis=...`
- Thresholding:
  - `impact_total >= min_impact`
  - `dqs <= max_dqs`
- Gap ranking formula:
  - `gap_score = impact_total * (1 - dqs)`
- Sorted by `gap_score DESC`.

Collection campaign creation:
- `POST /api/lca/collection-campaigns/create`
- Body fields:
  - `job_id`, `actor`
  - `min_spend`
  - `min_emissions_kgco2e` (emissions basis threshold)
  - `max_dqs`
  - `limit`
  - `impact_basis`
- Behavior:
  - Requires existing inventory rows (`409` otherwise).
  - Snapshots selected gap items into `lca_collection_campaigns.items`.

Campaign retrieval:
- `GET /api/lca/collection-campaigns?job_id=...&limit=...`
- `GET /api/lca/collection-campaigns/{campaign_id}`

Deliverable:
- Provide a ranked hotspot table, ranked gap table, and campaign snapshot metadata (criteria + item count + campaign id).
