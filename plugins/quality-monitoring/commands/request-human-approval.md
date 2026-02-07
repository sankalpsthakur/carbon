---
name: request-human-approval
description: Create a human approval request for failed quality gates or explicit override decisions.
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
---

Create an approval packet when gates fail or when override is requested.

```bash
ts=$(date -u +"%Y%m%dT%H%M%SZ")
mkdir -p content/approvals/quality-monitoring
cat > "content/approvals/quality-monitoring/request-${ts}.md" <<'EOF'
# Quality Gate Approval Request
- timestamp: ${ts}
- reason: failed gate(s) or override request
- requested_by: quality-monitoring
- decision_required: APPROVE or REJECT
- required_human_comment: true
EOF
```

Policy:
- Never auto-override failed gates.
- Require explicit human decision text before proceeding.
- After decision, call `workflows:quality-monitoring:record-memory`.
