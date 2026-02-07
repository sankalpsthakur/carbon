---
name: export-and-evidence-pack-constraints
description: Enforce export gate policy across evidence pack, ESRS CSV, iXBRL, and PDF report with snapshot integrity checks.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Use the export APIs with strict gate handling.

Endpoints:
1. `GET /api/export/evidence-pack`
- Query:
  - Option A: `snapshot_id`
  - Option B: `org_id` + `year` (must resolve to snapshot-stamped report)
- Returns: `{ sha256, evidence_pack }` with deterministic manifest sections and section checksums.

2. `GET /api/export/esrs-kpis.csv`
- Query: `org_id` + `year`, optional `snapshot_id`.
- Returns CSV including META rows for snapshot metadata.

3. `GET /api/export/ixbrl`
- Query: `org_id` + `year`, optional `snapshot_id`, optional `lei`.
- Returns iXBRL-style payload mapped from ESRS metrics (+ biodiversity tags when available).

4. `GET /api/export/pdf-report`
- Query: `org_id` + `year`, optional `snapshot_id`.
- Returns generated PDF document.

Evidence-pack hard gates (must enforce as blockers):
- `400`: missing both `snapshot_id` and `(org_id, year)`.
- `404`: unknown snapshot or report not found for explicit snapshot path.
- `409`: report is not snapshot-stamped when no explicit snapshot is passed.
- `409`: snapshot referenced by report not found.
- `409`: DMA snapshot not present.
- `409`: snapshot assessment status is not `final`.

Export policy:
- For assurance exports, always use explicit `snapshot_id`.
- Reject publishing if evidence-pack SHA is missing.
- Record snapshot tuple (`snapshot_id`, `snapshot_version`, `snapshot_sha256`) in release notes.

Deliverable:
- Export gate report with each endpoint status, active snapshot tuple, evidence-pack sha256, and go/no-go decision.
