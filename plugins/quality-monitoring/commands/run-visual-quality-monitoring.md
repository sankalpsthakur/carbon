---
name: run-visual-quality-monitoring
description: Execute visual testing and regression checks, then write a visual QA summary artifact.
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
---

Primary visual path:
```bash
if [ -f playwright.config.ts ] || [ -f playwright.config.js ]; then
  npx playwright test --reporter=line
else
  python3 scripts/visual_probe.py
fi
```

Persist visual report:
```bash
ts=$(date -u +"%Y%m%dT%H%M%SZ")
mkdir -p artifacts/quality-monitoring/visual
cat > "artifacts/quality-monitoring/visual/visual-${ts}.md" <<'EOF'
# Visual Quality Monitoring
- timestamp: ${ts}
- suite: playwright|visual-probe
- status: PASS|FAIL
- notes: capture failed snapshots, layout regressions, contrast issues
EOF
```

If visual checks fail, mark gate as failed and request human approval.
