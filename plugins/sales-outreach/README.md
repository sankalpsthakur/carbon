# sales-outreach

Revenue execution workflows: lead routing, outreach, approvals, calls, and meeting conversion.

## Layout
- `.claude-plugin/plugin.json`
- `.mcp.json` (optional MCP connectors; requires external `MCP_ROOT` + API keys)
- `commands/`
- `agents/`
- `skills/sales-outreach/SKILL.md`

## External Dependencies
This plugin can optionally start MCP servers from an external MCP checkout via `MCP_ROOT`:
- `retell-mcp-server` (requires `RETELL_API_KEY`)
- `hunter-io-mcp-server` (requires `HUNTER_API_KEY`)

Set:
```bash
export MCP_ROOT=/absolute/path/to/mcp
export RETELL_API_KEY=...
export HUNTER_API_KEY=...
```

## Commands
- `/workflows:sales-outreach:run-daily-revenue-cycle`
- `/workflows:sales-outreach:prepare-approval-batch`
- `/workflows:sales-outreach:launch-voice-qualification`

