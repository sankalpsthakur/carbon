# Plans

## Milestones
1. MCP Entry Point
   - Add `tools/strategy-mcp.js` and keep `.mcp.json` valid.
   - Validation:
     - Server responds to `initialize`, `tools/list`, `tools/call`.
     - `tools/list` includes `strategy.health` and `strategy.sha256`.

2. DMA Stakeholder Evidence Gate Parity
   - Update `skills/dma-audit-materiality-matrix/SKILL.md` to match gates in `commands/dma/dma-audit-ready-materiality-matrix-stakeholder.md`.
   - Validation:
     - Skill includes exact evidence count, internal+external requirement, stale evidence rule (> 18 months), and score spread adjudication (> 3).

3. External Risk Scanning Evidence Snapshots
   - Update `commands/risk/ai-external-risk-scan-regulatory-media-ngo.md` and `skills/ai-external-risk-scanning/SKILL.md` with mandatory evidence object + strict gates.
   - Validation:
     - Both command + skill include required fields: `evidence_snapshot_id`, `retrieved_at`, `canonical_url_sha256`, and `excerpt.quote`.
     - Both define excerpt capture rules and immutability rule for `evidence_snapshot_id`.

4. Cleanup + Metadata Hygiene
   - Remove empty legacy skill directories under `skills/`.
   - Update `.claude-plugin/plugin.json` to remove placeholder URLs and bump patch version.
   - Update `CHANGELOG.md` and `CASE_COVERAGE.md`.
   - Validation:
     - Legacy dirs removed and no references remain.
     - Manifest contains no `example.local`.
     - Changelog and case coverage reflect the hardening changes.
