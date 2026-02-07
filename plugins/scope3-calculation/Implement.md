# Implement

Implement Milestones 1-4 in `Plans.md` with these controls:

1. Create capability files:
- Commands:
  - `commands/baseline/spend-rapid-baseline-screenshot.md`
  - `commands/finance/cfo-carbon-ledger-rigor.md`
  - `commands/engineering/deep-tech-lca-physics-modeling.md`
- Skills:
  - `skills/spend-rapid-baseline/SKILL.md`
  - `skills/finance-carbon-ledger-rigor/SKILL.md`
  - `skills/deep-tech-lca-physics/SKILL.md`
- Agents:
  - `agents/spend-baseline-operator.md`
  - `agents/cfo-ledger-auditor.md`
  - `agents/deep-tech-lca-engineer.md`

2. Add `CASE_COVERAGE.md` mapping each capability to command/skill/agent and enforce all hard gates.
   - Ensure deep-tech physics gates include FU, conversion evidence, co-product allocation, and no silent downshift.

3. Update docs + metadata:
- `README.md`
- `CHANGELOG.md`
- `.claude-plugin/plugin.json` version/description
 - `tools/calc-mcp.js` MCP stdio server entrypoint referenced by `.mcp.json`

4. Verify:
- No path edits outside plugin boundary.
- Frontmatter correctness and reference integrity.
