# Documentation

## Milestone Status

1. Capability Command Packs: Complete
- Added baseline, finance, and engineering command packs with detailed endpoint flows and hard gates.

2. Capability Agents + Skills: Complete
- Added one agent and one skill per capability, wired to command packs and existing trace/compute workflows.

3. Coverage + Hard Gates: Complete
- Added `CASE_COVERAGE.md` with capability mapping and explicit gates for:
  - mixed units
  - functional unit (deep-tech)
  - conversion evidence (deep-tech)
  - co-product allocation (deep-tech)
  - no silent downshift (deep-tech/ledger/baseline)
  - FX gaps
  - sparse factors
  - replay drift

4. Plugin Metadata/Docs Update: Complete
- Updated `README.md`, `CHANGELOG.md`, and `.claude-plugin/plugin.json` (version `0.4.1`).
- Added minimal MCP stdio server entrypoint at `tools/calc-mcp.js`.

## Key Decisions

1. Reuse existing API contract
- All capability packs use current endpoint families (`/api/lca/*`, `/api/material-iros/*`, `/api/ingestion-jobs/*`) instead of inventing new service boundaries.

2. Explicit fail-closed policy
- Edge-case checks are documented as hard gates, preventing silent publication of unreliable screenshots.

3. Scoped ownership safety
- All modifications are local to this plugin directory to avoid cross-plugin conflicts.
