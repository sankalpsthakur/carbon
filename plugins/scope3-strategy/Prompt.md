# scope3-strategy Hardening

## Goals
- Make the MCP config runnable by providing the referenced stdio entrypoint.
- Eliminate command/skill gate drift for DMA stakeholder evidence controls.
- Require immutable, tamper-evident evidence snapshots for external risk scanning (URL hash + retrieval timestamp + excerpt capture + hashes).
- Remove empty legacy skill directories and placeholder plugin metadata.

## Spec
### P1: MCP
- Create `tools/strategy-mcp.js` so `.mcp.json` resolves.
- Implement a minimal MCP stdio server (no dependencies) supporting:
  - `initialize`
  - `tools/list`
  - `tools/call`
- Provide tools:
  - `strategy.health`
  - `strategy.sha256`

### P2: Gate Parity
- Align `skills/dma-audit-materiality-matrix/SKILL.md` gates with `commands/dma/dma-audit-ready-materiality-matrix-stakeholder.md`:
  - Evidence counts per material IRO
  - Internal + external requirement for high-severity IROs
  - Stale evidence rule
  - Adjudication rule for score spread

### P2: External Risk Evidence Snapshots
- Harden `commands/risk/ai-external-risk-scan-regulatory-media-ngo.md` and `skills/ai-external-risk-scanning/SKILL.md`:
  - Mandatory evidence object per signal with immutable `evidence_snapshot_id`
  - Mandatory excerpt/quote capture + hashing
  - Mandatory `retrieved_at` timestamp
  - Mandatory canonical URL hashing (`canonical_url_sha256`)
  - Strict validation gates

### Cleanup
- Remove empty legacy skill directories under `skills/`:
  - `dma-workflow`, `export-package`, `ocr-quality-gate`
- Remove placeholder `example.local` metadata in `.claude-plugin/plugin.json`, bump patch version, and update `CHANGELOG.md` + `CASE_COVERAGE.md`.

## Deliverables
- Working MCP stdio server entrypoint at `tools/strategy-mcp.js`.
- Updated command + skill documents with aligned and hardened gates.
- Updated plugin manifest version + metadata and refreshed changelog/coverage mapping.
