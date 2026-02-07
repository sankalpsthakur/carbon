---
name: reduce-measure-report
description: Execute Measure -> Reduce -> Report verification sequence and gate report readiness on deterministic data and controls.
allowed-tools:
  - Bash
  - Read
---
Run this sequence after pipeline execution.

Measure phase:
1. Seed baseline if needed: `POST /api/measure/seed`.
2. Validate inventory: `GET /api/measure/overview?period=<period>`.
- Must include:
  - `total_upstream_tco2e > 0`
  - populated `category_breakdown`
  - populated `top_suppliers`
3. Validate supplier rollup: `GET /api/measure/suppliers?period=<period>`.

Reduce phase:
1. Candidate table: `GET /api/suppliers`.
- Validate only non-leader, impact-positive suppliers are returned.
2. Filter behavior: `GET /api/suppliers/filter` with category/rating/min impact params.
3. Deep dive payload: `GET /api/suppliers/{supplier_id}/deep-dive` or `/api/v1/recommendations/supplier/{supplier_id}/deep-dive`.
- Validate schema sections and evidence indicators (`evidence_status`).

Report control phase:
1. Run quality scan: `POST /api/quality/anomalies/run`.
2. Pull anomalies: `GET /api/quality/anomalies?status=open`.
3. Pull audit trail: `GET /api/admin/audit`.
4. Pull metrics snapshot: `GET /api/admin/metrics`.

Publish gate:
- PASS only if Measure inventory valid, Reduce candidates/deep-dive render correctly, and quality+audit endpoints return evidence for the run.
- FAIL if any blocking anomalies remain unresolved for high-impact supplier benchmark fields.
