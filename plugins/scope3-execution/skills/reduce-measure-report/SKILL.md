---
name: reduce-measure-report
description: Runs Measure inventory checks, Reduce candidate/deep-dive validation, and report controls through anomalies and audit telemetry.
---
# Reduce -> Measure -> Report Skill

Use after pipeline data is available to gate report publication.

Sequence:
1. Measure checks:
- `GET /api/measure/overview`
- `GET /api/measure/suppliers`
2. Reduce checks:
- `GET /api/suppliers`
- `GET /api/suppliers/filter`
- `GET /api/suppliers/{supplier_id}/deep-dive` (or v1 contract endpoint)
3. Report controls:
- `POST /api/quality/anomalies/run`
- `GET /api/quality/anomalies`
- `GET /api/admin/audit`
- `GET /api/admin/metrics`

Validation criteria:
- inventory totals and key lists are non-empty after seed
- reduce candidates satisfy backend default exclusion logic
- deep-dive contract sections present (`meta`, `metrics`, `content`)
- anomaly and audit systems return run evidence

Output format:
- pass/fail per phase
- blockers with endpoint evidence
- final publish recommendation
