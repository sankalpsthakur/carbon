---
name: prepare-approval-batch
description: Convert outreach proposals into approval inbox requests with explicit APPROVE/REJECT contract.
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
---

Create approval packets under `content/approvals/revenue/`.
Required fields:
- requestId
- leadId
- channel
- draft
- riskNotes
- decision
