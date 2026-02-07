---
name: carbon-strategy-iros
description: Create, list, and score IROs (Impacts, Risks, Opportunities) for a DMA assessment.
allowed-tools:
  - mcp__strategy-local__strategy.iro.create
  - mcp__strategy-local__strategy.iro.list
  - mcp__strategy-local__strategy.iro.score
  - mcp__strategy-local__strategy.assessment.get
  - Read
  - Write
---
Use this flow to populate and score IROs within a DMA assessment.

Execution sequence:

1. Verify assessment
- Call `strategy.assessment.get` with `assessment_id` to confirm it exists and is not finalized.

2. Create IROs
- Call `strategy.iro.create` for each identified impact, risk, or opportunity.
- Required fields: `assessment_id`, `type` (impact|risk|opportunity), `topic` (ESRS code like E1, S1, G1), `title`.
- The server links each IRO to the assessment and its org.

3. List IROs
- Call `strategy.iro.list` with `assessment_id` to see all IROs and their current state.

4. Score IROs
- Call `strategy.iro.score` for each IRO with:
  - `iro_id` (required)
  - `impact_materiality` (1-5, required)
  - `financial_materiality` (1-5, required)
  - `likelihood` (1-5, optional)
  - `confidence` (low|medium|high, optional)
- Scores drive materiality matrix placement and ESRS sequencing.

Scoring guidance:
- 1 = negligible, 2 = low, 3 = moderate, 4 = significant, 5 = critical
- Raise confidence to "high" only when supported by diverse stakeholder evidence.
- Score spread > 3 between impact and financial materiality warrants an adjudication note.

Validation gates:
- IRO creation and scoring are blocked on finalized assessments (409).
- Assessment/org mismatch on IRO create returns 400.
- Scores must be in 1-5 range.

Deliverable:
- Complete IRO register with types, topics, titles, and materiality scores ready for matrix generation.
