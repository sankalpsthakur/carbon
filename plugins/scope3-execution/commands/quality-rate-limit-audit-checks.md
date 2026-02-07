---
name: quality-rate-limit-audit-checks
description: Run deterministic quality anomaly checks, verify endpoint rate limits, and confirm audit trail emission for critical actions.
allowed-tools:
  - Bash
  - Read
---
Run production-readiness controls for quality, rate limits, and auditable trace.

Quality checks:
1. Trigger scan: `POST /api/quality/anomalies/run`.
- Rate limit: 4/min.
2. Query anomalies: `GET /api/quality/anomalies` with optional `status`/`severity`.
3. Validate status transitions:
- `POST /api/quality/anomalies/{anomaly_id}/status` with `open|ignored|resolved`.
- Any other value must return `400`.

Rate-limit verification probes:
1. Deep dive endpoint: `GET /api/suppliers/{supplier_id}/deep-dive`.
- Expect `429` after threshold near 15 calls/min.
2. PDF export endpoint: `GET /api/suppliers/{supplier_id}/export-pdf`.
- Expect `429` after threshold near 10 calls/min.
3. Pipeline endpoint checks:
- `POST /api/pipeline/download` threshold 3/min
- `POST /api/pipeline/ingest` threshold 6/min
- `POST /api/pipeline/generate` threshold 4/min

Audit verification:
1. Pull events: `GET /api/admin/audit`.
2. Confirm presence of event names for actions executed in this run:
- quality: `quality.anomalies.run`, `quality.anomalies.status`
- reduce/report probes: `deep_dive.view`, `pdf.export`
- optional engagement probe: `engagement.update`

Pass criteria:
- Anomaly engine runs and returns `upserted` count.
- Rate limits enforce `429` at expected boundaries.
- Audit stream includes the exercised actions with recent timestamps.
