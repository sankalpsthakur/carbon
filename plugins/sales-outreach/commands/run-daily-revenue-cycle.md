---
name: run-daily-revenue-cycle
description: Run end-to-end daily revenue cycle from due leads to approved send requests and call follow-ups.
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
---

1. List due leads:
```bash
python3 -m pipelines.lead_to_meeting_graph --limit 5 --due-only --stages "Suspect,Prospect"
```
2. Draft outreach proposals:

- Drafts artifacts under `crm/interactions/`
- Writes pending approvals + lead state into `state/ops.db`
- Emits simulated KPI events into `state/metrics.db`

3. After approvals exist, prepare send-request artifacts:
```bash
python3 -m pipelines.lead_to_meeting_graph --resume --outbox crm/outbox
```

4. If approved, dispatch via diplomat/call workflows and log results to `state/revenue/cycle-*.json`.
