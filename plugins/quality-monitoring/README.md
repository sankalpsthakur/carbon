# quality-monitoring

Workflow wrapper for quality gates, visual testing, human approvals, and persistent quality memory.

## Layout
- `.claude-plugin/plugin.json`
- `.mcp.json` (empty by default)
- `commands/`
- `agents/`
- `scripts/visual_probe.py` (fallback visual check)
- `skills/quality-monitoring/SKILL.md`

## Commands
- `/workflows:quality-monitoring:run-quality-gates`
- `/workflows:quality-monitoring:run-visual-quality-monitoring`
- `/workflows:quality-monitoring:request-human-approval`
- `/workflows:quality-monitoring:record-memory`

## Artifacts (written into the current working directory)
- `artifacts/quality-monitoring/`
- `state/quality-monitoring/quality-memory.jsonl`
- `content/approvals/quality-monitoring/`

