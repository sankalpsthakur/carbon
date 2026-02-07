---
name: csrd-dma-first-precollection-guidance
description: Build classic CSRD strategy guidance before data collection with DMA-first scoping, IRO hypotheses, and evidence-ready collection controls.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Run this before requesting any operational data files.

Objective:
- Produce a board-grade "CSRD + DMA pre-collection strategy brief" so evidence collection is guided by materiality hypotheses rather than spreadsheet availability.

Execution sequence:
1. Initialize DMA context first
- `POST /api/dma/assessments` with `org_id`, `year`.
- Reuse existing `(org_id, year)` assessment if present; never fork parallel assessments for the same period.

2. Create strategic IRO hypothesis inventory
- Seed top-down IROs with `POST /api/dma/iros` for at least:
  - Climate transition/physical (`E1`) risk/opportunity.
  - Pollution (`E2`) impact/risk.
  - Water (`E3`) impact/risk.
  - Resource use and circularity (`E5`) impact/opportunity.
- Tag each hypothesis with intended decision use (capital allocation, compliance, supplier action, product redesign).

3. Define pre-collection scoring design
- Use provisional scoring via `PUT /api/dma/iros/{iro_id}/score` with low/medium confidence where evidence is still pending.
- Record rationale assumptions explicitly as testable hypotheses, not conclusions.

4. Build evidence-first collection backlog
- For each IRO, define:
  - Required evidence type (`regulatory_chunk|uploaded_doc|url|note|stakeholder_evidence|external_doc`).
  - Data owner, due date, validation owner, and fallback source.
  - Minimum evidence threshold needed before score elevation.
- Add boundary assumptions (organizational units + value chain scope) with `PUT /api/dma/assessments/{assessment_id}/boundary`.

5. Publish the pre-collection strategy packet
- Freeze a non-final draft snapshot (`POST /api/dma/assessments/{assessment_id}/snapshot` with `finalize=false`) for traceability of assumptions.

Hard validation gates:
- Block if `org_id`/`year` context is missing or inconsistent.
- Block if fewer than 4 topic families (`E1`, `E2`, `E3`, `E5`) are represented in hypotheses.
- Block if any IRO lacks a named data owner and evidence acquisition path.
- Block if boundary assumptions are absent before collection requests are sent.
- Block any `finalize=true` attempt before evidence coverage is complete (`409` path remains authoritative).

Deliverable:
- Pre-collection strategy brief containing assessment id, IRO hypothesis register, scoring assumptions ledger, collection backlog, boundary assumptions, and draft snapshot digest.
