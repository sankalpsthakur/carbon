# Prompt

## Goal
Enhance `scope3-calculation` with screenshot-ready capability packs for:
1. Spend-based rapid baseline inventory.
2. Finance-grade carbon ledger rigor and audit traceability.
3. Deep-tech LCA product engineering and supply-chain physics modeling.

## Scope
- Add detailed command documents with YAML frontmatter and `allowed-tools`.
- Add matching agents and skills with valid YAML frontmatter.
- Add explicit capability-to-component coverage mapping and hard edge-case gates.
- Keep edits isolated to this plugin directory only.

## Deliverables
- New commands under `commands/baseline`, `commands/finance`, `commands/engineering`.
- New agents under `agents/`.
- New skills under `skills/`.
- Minimal MCP stdio server entrypoint at `tools/calc-mcp.js` (for `.mcp.json`).
- `CASE_COVERAGE.md` with capability map plus hard gates for:
  - functional unit, conversion evidence, co-product allocation, no silent downshift
  - mixed units, FX gaps, sparse factors, replay drift
- Updated plugin metadata and docs for discoverability/versioning.
