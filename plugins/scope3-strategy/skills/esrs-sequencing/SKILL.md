---
name: esrs-sequencing
description: Executes the strict compute -> materiality -> anomalies pipeline with prerequisite validation.
---
Use this skill when generating strategy analytics runs.

Workflow:
1. `POST /api/compute/run` with either `snapshot_id` or `(org_id, year)`.
2. `POST /api/materiality/run` for same org/year.
3. `POST /api/anomalies/run` for same org/year.
4. Persist run references and thresholds.

Validation gates:
- Compute input contract gate (`400` if snapshot or org/year is incomplete).
- Materiality precompute gate (`404 Run compute first`).
- Anomaly YoY baseline gate (`400 Need reports for year and previous year`).

Deliverable:
- Sequencing report with run IDs, computed topic materiality flags, anomaly count, and failed gates.
