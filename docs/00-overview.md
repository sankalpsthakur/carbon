# 00: Overview

## What CarbonKit Is Today (Current Repo State)

CarbonKit is a Claude Code SDK layer for end-to-end Scope 1/2/3 carbon accounting:

- **11 plugins**: scope3-strategy, scope3-calculation, scope3-execution, scope12-accounting, connectors, swarms, ai-engineering, growth-content, quality-monitoring, sales-outreach, shared-services
- **6 MCP servers**: calc, exec, strategy, scope12, swarm, connectors (stdio default; optional HTTP mode)
- **50+ agents** defined as markdown with YAML frontmatter
- **70+ slash commands** across domain + general-purpose plugins
- **100+ skills** across ESG domain, AI/ML, and general-purpose utilities
- **Team compositions** defined in `plugins/teams/teams.json` (esg-scope3, esg-scope12, revops, growth, esg-full-swarm)

## Current Gaps

| Area | Status |
|------|--------|
| Database | Unified store adapter exists (file + sqlite). Postgres not supported yet. |
| HTTP transport | HTTP mode exists; needs hardened concurrency semantics + clearer contract. |
| Containerization | Docker Compose exists for MCP servers; still needs polish for “one command” UX. |
| Offline/privacy | LLM router exists (anthropic/ollama/vllm/llamacpp), but “offline mode” is not fully enforced everywhere. |
| CI/CD | No GitHub Actions workflow in-repo (tests run locally via `make` / `npm test`). |

## Vision: Self-Hosted Swarm Research Platform

Transform CarbonKit into a system that:

1. **Runs fully offline** on private infrastructure (SQLite + Ollama)
2. **Orchestrates agent swarms** via declarative YAML workflows
3. **Connects to real data sources** (SAP, Concur, Xero, Excel, etc.) through schema mapping
4. **Calculates real emissions** across all scopes with audit-grade evidence
5. **Self-heals** when agents hit failures, with checkpoint/replay
6. **Deploys in one command** via Docker Compose

## Architecture After Build

```
User (CEO)
  |
  v
Claude (Chief of Staff) -- TeamCreate/SendMessage
  |
  v
Swarm Conductor -- reads workflow YAML, resolves DAG
  |
  v
Stage Supervisors -- one per active stage, gates, merge
  |
  v
Domain Agents (25+) -- unmodified markdown definitions
  |
  v
MCP Tools (47+) -- calc, exec, strategy, scope12, swarm, connectors
  |
  v
Store Adapter -- SQLite (default) / Postgres (scale)
```

## File Counts

| Category | New | Modified |
|----------|-----|----------|
| Store adapter + backends | 5 | 3 MCP servers |
| Validate/helpers | 2 | package.json |
| Scope 1/2 MCP + data | 5 | scope12 .mcp.json |
| Swarm plugin | 20 | teams.json |
| Connectors plugin | 30 | carbonkit-cli.js |
| Docker infra | 8 | test-mcp-servers.js |
| Tests + CI | 6 | plugin .mcp.json files |
| **Total** | **~55** | **~12** |
