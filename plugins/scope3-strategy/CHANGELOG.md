# Changelog

## 0.5.1 - 2026-02-06
- Added screenshot-focused CSRD/DMA-first pre-collection strategy command, agent, and skill.
- Added screenshot-focused DMA audit-ready materiality matrix command, agent, and skill with stakeholder controls.
- Added screenshot-focused AI external risk scanning command, agent, and skill for regulatory/media/NGO channels.
- Added `CASE_COVERAGE.md` mapping capabilities to command/skill/agent artifacts and handled edge cases.
- Fixed MCP stdio server entrypoint (`tools/strategy-mcp.js`) and added tools: `strategy.health`, `strategy.sha256`.
- Aligned DMA stakeholder evidence gates between command and skill (counts, internal+external requirement, stale evidence rule, score-spread adjudication).
- Hardened external risk scanning command and skill with immutable evidence snapshots (id, retrieval timestamp, canonical URL hash, excerpt capture + hash) and strict gates.
- Removed empty legacy skill directories (`skills/dma-workflow`, `skills/export-package`, `skills/ocr-quality-gate`).
- Cleaned placeholder plugin manifest URLs and bumped patch version to `0.5.1`.
