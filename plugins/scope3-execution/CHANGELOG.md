# Changelog

## 0.4.1
- Fixed MCP config by implementing the referenced MCP stdio server entrypoint (`exec.health`, `exec.sha256`).
- Defined deterministic tier cascade `child_key` derivation (v1) for stable synthetic tier IDs.
- Defined `source_docs` / `source_citations` suppression contract with deterministic `evidence_snapshot_id` (v1).
- Specified explicit OCR confidence thresholds and suppression behavior (suppress vs manual review vs block).
- Removed placeholder manifest URLs and bumped patch version.

## 0.4.0
- Added screenshot-enabled disclosure intelligence command, skill, and agent for public-data-first survey suppression.
- Added supplier maturity scorecard command, skill, and agent with standardized engagement note language.
- Added tier-2+ survey cascade command, skill, and agent with explicit non-response escalation tiers.
- Added `CASE_COVERAGE.md` mapping capabilities to commands/skills/agents with edge-case playbooks.
- Added richer plugin manifest metadata.
- Added optional hooks and MCP config.
- Expanded command/agent/skill coverage for production-style swarm runs.
