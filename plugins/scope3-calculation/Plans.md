# Plans

## Milestones

1. Capability Command Packs
- Add spend baseline, CFO ledger, and deep-tech physics commands.
- Validation: each file has YAML frontmatter with `name`, `description`, `allowed-tools`.

2. Capability Agents + Skills
- Add one agent and one skill per capability.
- Validation: frontmatter parse-safe and command/skill references resolve to existing files.

3. Coverage + Hard Gates
- Add `CASE_COVERAGE.md` mapping capability -> command/skill/agent.
- Validation: explicitly covers functional unit, conversion evidence, co-product allocation, no silent downshift, mixed units, FX gaps, sparse factors, replay drift.

4. Plugin Metadata/Docs Update
- Update `.claude-plugin/plugin.json`, `README.md`, and `CHANGELOG.md`.
- Validation: version bumped and new capability packs discoverable by path.

## Validation Checklist
- `rg --files` shows all new command/agent/skill paths.
- Frontmatter blocks are balanced with `---`.
- No edits outside this plugin directory.
