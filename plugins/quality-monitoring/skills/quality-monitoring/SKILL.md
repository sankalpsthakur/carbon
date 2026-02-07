---
name: quality-monitoring
description: Workflow skill for quality gates, visual testing quality monitoring, human approval checkpoints, and memory-based quality governance.
---

# Quality Monitoring

This skill coordinates four controls:
- Quality gates
- Visual testing quality monitoring
- Human approvals for overrides
- Persistent memory of outcomes

## Core Workflows

1. Run `workflows:quality-monitoring:run-quality-gates`.
2. Run `workflows:quality-monitoring:run-visual-quality-monitoring`.
3. If failures exist, run `workflows:quality-monitoring:request-human-approval`.
4. Always run `workflows:quality-monitoring:record-memory`.

## Gate Policy

- No silent overrides.
- No release progression when gates fail without explicit human approval.
- Every decision is recorded in `state/quality-monitoring/quality-memory.jsonl`.

## Artifacts

- `artifacts/quality-monitoring/gate-*.md`
- `artifacts/quality-monitoring/visual/visual-*.md`
- `content/approvals/quality-monitoring/request-*.md`
- `state/quality-monitoring/quality-memory.jsonl`

## Bundled Skills

### Evaluation & Benchmarking
- skills/lm-eval — LLM evaluation across academic benchmarks
- skills/bigcode-eval — Code generation model benchmarks

### Observability & Tracking
- skills/langsmith — LLM tracing, testing, and monitoring
- skills/phoenix — LLM observability and debugging (Arize)
- skills/wandb — Experiment tracking and ML observability
- skills/mlflow — Experiment lifecycle and model registry
