---
name: record-quality-memory
description: Append quality monitoring outcomes to persistent memory for trend analysis and future gate tuning.
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
---

Append one memory event per quality run/approval decision.

```bash
ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
mkdir -p state/quality-monitoring
jq -n \
  --arg timestamp "$ts" \
  --arg event "gate_run|visual_run|approval_decision" \
  --arg status "PASS|FAIL|APPROVED|REJECTED" \
  --arg summary "brief summary" \
  '{timestamp:$timestamp,event:$event,status:$status,summary:$summary}' \
  >> state/quality-monitoring/quality-memory.jsonl
```

Rules:
- Keep one JSON object per line.
- Never rewrite history entries.
- Include links to artifacts when available.
