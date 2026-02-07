---
name: compute-materiality-anomaly-sequence
description: Execute ESRS compute, then materiality scoring, then anomaly scan with strict prerequisite gates.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Run this sequence in-order without skipping prerequisites.

Step 1. Compute ESRS report
- Endpoint: `POST /api/compute/run`
- Body:
  - Option A: `{ "snapshot_id": "dmasnap_*" }`
  - Option B: `{ "org_id": "org_*", "year": 2025 }`
- Behavior:
  - Computes E1/E2/E3/E5 KPIs from products + latest LCA-by-SKU + latest volume record per SKU/year.
  - Merges latest manual Scope 1/2 for same year.
  - Persists report with optional DMA snapshot metadata if snapshot path is used.

Step 2. Run materiality
- Endpoint: `POST /api/materiality/run`
- Body:
  - `org_id`, `year`
  - optional `thresholds` (`materiality_score_threshold`, `e1_scope3_tco2e_high`, `e3_water_m3_high`, `e5_waste_t_high`, `e2_pollutants_kg_high`, `water_high_stress_share_high`)
- Output topics: `E1`, `E2`, `E3`, `E5` with `material` flag, `severity`, `drivers`, `linked_disclosures`.

Step 3. Run anomalies
- Endpoint: `POST /api/anomalies/run`
- Body:
  - `org_id`, `year`
  - optional `pct_threshold_high` (default `0.2`), `pct_threshold_medium` (default `0.1`)
- Compares current year to previous year for:
  - `total_ghg_tco2e`, `scope3_cat1_tco2e`, `water_m3_total`, `waste_t`, `circularity_pct`.

Hard validation gates:
- Compute must fail with `400` when neither `snapshot_id` nor full `(org_id, year)` is provided.
- Compute must fail with `404` when `snapshot_id` is unknown.
- Materiality must fail with `404 Run compute first` when report is missing.
- Anomalies must fail with `400 Need reports for year and previous year` when either year is missing.
- If Step 1 fails, Steps 2-3 are blocked.

Deliverable:
- Sequence ledger containing report id, materiality run id, anomaly run id, thresholds/rules used, and blocked/passed gates.
