---
name: run-quality-gates
description: Run automated quality gates, generate a gate report, and block release on failing checks unless a human override is approved.
allowed-tools:
  - Read
  - Write
  - Grep
  - Glob
  - Bash
---

Run these gates in order and stop on first hard failure:

1. Contract/plugin checks:
```bash
if [ -f scripts/validate_bundle.py ]; then
  python3 scripts/validate_bundle.py --mcp-selftest
elif [ -d tests ]; then
  python3 -m pytest -q tests
else
  echo "no bundle validator or tests/ directory found; skipping contract gates"
fi
```

2. Core regression checks (if present):
```bash
if [ -d tests ]; then
  python3 -m pytest -q tests
else
  echo "no tests/ directory found; skipping regression gates"
fi
```

3. Visual quality checks:
- If Playwright config exists, run:
```bash
npx playwright test --reporter=line
```
- Otherwise, run the visual fallback in this plugin:
```bash
python3 scripts/visual_probe.py
```

4. Persist gate report:
```bash
ts=$(date -u +"%Y%m%dT%H%M%SZ")
mkdir -p artifacts/quality-monitoring
cat > "artifacts/quality-monitoring/gate-${ts}.md" <<'EOF'
# Quality Gate Report
- timestamp: ${ts}
- status: PASS|FAIL
- failed_gates: []
- next_action: release|request-human-approval
EOF
```

Rules:
- If any mandatory gate fails, do not proceed with release actions.
- Route failures to `workflows:quality-monitoring:request-human-approval`.
- Always call `workflows:quality-monitoring:record-memory` after each gate run.
