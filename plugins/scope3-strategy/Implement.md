# Implement

Follow `Plans.md` in order (P1 then P2), keeping all validations passing.

Implementation checklist:
1. MCP
   - Ensure `tools/strategy-mcp.js` implements MCP stdio framing and methods: `initialize`, `tools/list`, `tools/call`.
   - Ensure tools exist: `strategy.health`, `strategy.sha256`.

2. DMA Gate Parity
   - Update `skills/dma-audit-materiality-matrix/SKILL.md` so it exactly reflects the hard gates in `commands/dma/dma-audit-ready-materiality-matrix-stakeholder.md`.

3. External Risk Snapshot Hardening
   - Update `commands/risk/ai-external-risk-scan-regulatory-media-ngo.md` and `skills/ai-external-risk-scanning/SKILL.md` to require the mandatory evidence object and strict gates.

4. Cleanup + Metadata
   - Remove empty legacy skill dirs and any references.
   - Remove placeholder URLs, bump patch version, and update `CHANGELOG.md` + `CASE_COVERAGE.md`.
