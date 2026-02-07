# growth-content

Growth and content workflows for campaign planning, content briefs, and meme batching.

## Layout
- `.claude-plugin/plugin.json`
- `.mcp.json` (optional MCP connectors; requires external `MCP_ROOT`)
- `commands/`
- `agents/`
- `skills/growth-content/SKILL.md`

## External Dependencies
This plugin can optionally start MCP servers from an external MCP checkout via `MCP_ROOT`:
- `sequential-thinking-mcp-server`
- `nano-banana-mcp-server` (requires `GOOGLE_API_KEY`)

Set:
```bash
export MCP_ROOT=/absolute/path/to/mcp
export GOOGLE_API_KEY=...
```

## Commands
- `/workflows:growth-content:content-brief`
- `/workflows:growth-content:campaign-audit`
- `/workflows:growth-content:meme-ideation-batch`

