---
name: export-evidence-pack
description: Produces and validates strategy exports with evidence-pack specific assurance constraints.
---
Use this skill for release-grade exports.

Workflow:
1. Resolve export context using `snapshot_id` or `(org_id, year)`.
2. Generate evidence pack via `/api/export/evidence-pack`.
3. Generate ESRS CSV, iXBRL, and PDF exports.
4. Verify evidence pack SHA and snapshot tuple in release output.

Validation gates:
- Evidence pack must reference a valid finalized DMA snapshot.
- If no snapshot context is available, block assurance export.
- Treat all `/api/export/evidence-pack` `409` responses as blocking policy violations.

Deliverable:
- Export release packet with artifact list, evidence-pack sha256, snapshot metadata, and go/no-go.
