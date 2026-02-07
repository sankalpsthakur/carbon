# ai-engineering

Model engineering workflows across training, inference, optimization, RAG, and serving.

## Layout
- `.claude-plugin/plugin.json`
- `.mcp.json` (optional MCP connectors; requires external `MCP_ROOT`)
- `commands/` (slash commands)
- `agents/` (orchestrators)
- `skills/ai-engineering/SKILL.md`

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
- `/workflows:ai-engineering:train-or-finetune-stack`
- `/workflows:ai-engineering:run-serving-benchmark`
- `/workflows:ai-engineering:build-rag-stack`

