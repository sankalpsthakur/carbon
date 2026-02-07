---
name: quality-rate-limit-audit
description: Verifies anomaly detection, endpoint throttle enforcement, and audit-event completeness for execution controls.
---
# Quality / Rate Limit / Audit Skill

Use for control-plane verification before production-readiness sign-off.

Workflow:
1. Run deterministic anomalies (`POST /api/quality/anomalies/run`).
2. Review and optionally triage anomalies (`GET /api/quality/anomalies`, `POST /api/quality/anomalies/{anomaly_id}/status`).
3. Probe key throttles:
- deep dive 15/min
- PDF export 10/min
- download 3/min
- ingest 6/min
- generate 4/min
- OCR 12/min
4. Confirm audit events from this run at `GET /api/admin/audit`.

Required evidence:
- at least one anomaly scan event
- at least one rate-limit `429` probe result for exercised endpoints
- corresponding audit entries for exercised actions
