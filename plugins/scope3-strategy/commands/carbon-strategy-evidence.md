---
name: carbon-strategy-evidence
description: Attach stakeholder evidence to IROs for audit-grade DMA documentation.
allowed-tools:
  - mcp__strategy-local__strategy.evidence.add
  - mcp__strategy-local__strategy.iro.list
  - mcp__strategy-local__strategy.assessment.get
  - mcp__strategy-local__strategy.db.list
  - Read
  - Write
---
Use this flow to capture and attach stakeholder evidence to IROs within a DMA assessment.

Execution sequence:

1. Review IRO register
- Call `strategy.iro.list` with `assessment_id` to identify IROs needing evidence.
- Focus on IROs with `evidence_count: 0` first.

2. Capture evidence
- Call `strategy.evidence.add` for each evidence item with:
  - `iro_id` (required)
  - `source` (name or URL of the evidence source, required)
  - `stakeholder_type` ("internal" or "external", required)
  - `description` (what the evidence shows, required)
- The server deduplicates by source hash per IRO (409 on duplicate).

3. Ensure stakeholder diversity
- Each material IRO should have at least 2 independent evidence links.
- High-severity IROs require at least 1 internal and 1 external perspective.
- Use `strategy.db.list` with collection `evidence` to audit coverage.

Stakeholder type guidance:
- Internal: operations, procurement, finance, compliance, HR, engineering.
- External: customers, suppliers, investors/lenders, regulators, civil society, NGOs, communities.

Validation gates:
- Evidence cannot be added to IROs in finalized assessments (409).
- Duplicate evidence (same source + IRO) is rejected (409).
- Finalization gate blocks when any IRO has zero evidence links.

Evidence quality criteria:
- Evidence older than 18 months should be flagged as "stale" unless explicitly justified.
- Paraphrase-only claims are insufficient for high-severity topics - capture verbatim excerpts.
- Each evidence item should be independently verifiable.

Deliverable:
- Complete evidence register with stakeholder diversity across all material IROs, ready for matrix and snapshot operations.
