# Carbon

[![npm version](https://img.shields.io/npm/v/@sankalpsthakur/carbon)](https://www.npmjs.com/package/@sankalpsthakur/carbon)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

AI agent for end-to-end Scope 1/2/3 carbon accounting and decarbonisation workflows.

11 plugins, 6 MCP servers (105 tools), 74 slash commands, 52 agents, 118 skills.

Built on the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) -- type `carbon` to get an interactive AI agent with all 6 MCP servers as tools, or use it as a bundle of Claude Code plugins and MCP servers.

## Installation

```bash
npm install @sankalpsthakur/carbon
```

Requires Node.js >= 18.

## Quick Start

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Launch interactive agent
carbon

# Resume a previous session
carbon chat <session-id>

# Or use utility commands
carbon list
carbon validate scope3-calculation
carbon help
```

### From Source

```bash
git clone https://github.com/sankalpsthakur/carbon.git && cd carbon

# Install dependencies
cd plugins && npm install

# Launch interactive agent
ANTHROPIC_API_KEY=sk-ant-... node shared-services/tools/carbon-cli.js

# Run smoke tests (6 MCP servers, 105 tools)
node test-mcp-servers.js

# Run all unit tests (253 tests)
node --test **/__tests__/*.test.js

# Validate all plugin manifests
node shared-services/tools/validate.js
```

## Features

- **Scope 3 Calculation Engine** -- emission factor matching, currency conversion, data quality scoring, bulk ingest/export
- **Scope 1/2 Accounting** -- stationary combustion, mobile sources, purchased electricity, KPI dashboards
- **Execution Pipelines** -- document OCR, provenance tracking, PDF export, multi-step orchestration
- **Strategy & Compliance** -- CSRD/ESRS double materiality assessment, risk scanning, target-setting snapshots
- **Swarm Orchestration** -- DAG-based multi-agent workflows for complex decarbonisation tasks
- **Connectors** -- schema mapping for ERP, CRM, and expense systems
- **Interactive CLI** -- conversational AI agent with session persistence and cost tracking

## Project Structure

```
carbon/
  plugins/
    scope3-calculation/    # Scope 3 calc engine (13 MCP tools)
    scope3-execution/      # Pipeline orchestration, OCR provenance (23 tools)
    scope3-strategy/       # CSRD/DMA materiality, risk scanning (20 tools)
    scope12-accounting/    # Scope 1/2 accounting, KPI, reporting (23 tools)
    swarms/                # DAG-based multi-agent orchestration (16 tools)
    connectors/            # ERP/CRM/expense schema mapping (10 tools)
    shared-services/       # Store adapter, CLI, cross-plugin infra
    ai-engineering/        # Model training, inference, RAG workflows
    growth-content/        # Campaign planning, content batching
    quality-monitoring/    # Quality gates, visual testing
    sales-outreach/        # Revenue execution, voice qualification
  docker/                  # Dockerfiles for all MCP servers
  docs/                    # Architecture docs, swarm guides
  Makefile                 # Docker, test, backup targets
```

## MCP Servers

All 6 servers speak JSON-RPC 2.0 over stdio (default) or HTTP.

| Server | Tools | Port (HTTP) | Health Endpoint |
|--------|-------|-------------|-----------------|
| calc | 13 | 8401 | `calc.health` |
| exec | 23 | 8402 | `exec.health` |
| strategy | 20 | 8403 | `strategy.health` |
| scope12 | 23 | 8404 | `scope12.health` |
| swarm | 16 | 8405 | `swarm.health` |
| connectors | 10 | 8406 | `connectors.health` |

## CLI

```bash
carbon              # Launch interactive AI agent
carbon chat <id>    # Resume a previous session
carbon <command>    # Run a utility command
```

| Command | Description |
|---------|-------------|
| `carbon` | Launch interactive AI agent (6 MCP servers, 105 tools) |
| `carbon chat [session-id]` | Launch agent, optionally resume a session |
| `carbon list` | List all 11 installed plugins |
| `carbon init <name>` | Scaffold a new plugin |
| `carbon run <plugin>:<tool>` | Spawn MCP server and call a tool |
| `carbon validate <plugin>` | Check plugin.json, commands, MCP health |
| `carbon export <plugin>:<job_id>` | Create audit bundle with hashes |
| `carbon help` | Show usage |

### Interactive Agent Commands

Inside the interactive agent, these commands are available:

| Command | Description |
|---------|-------------|
| `/status` | Show MCP server connection status |
| `/session` | Show current session ID (for resume) |
| `/cost` | Show accumulated cost and turns |
| `/help` | Show available commands |
| `/exit` | Exit the agent |

## Testing

```bash
cd plugins

# Smoke tests -- starts each MCP server, sends initialize + tools/list + health
node test-mcp-servers.js

# All 253 unit tests
node --test **/__tests__/*.test.js

# Individual suites
npm run test:store       # Store adapter (file/SQLite backends)
npm run test:calc        # Scope 3 calculation engine
npm run test:exec        # Execution pipeline
npm run test:strategy    # Strategy & DMA tools
npm run test:scope12     # Scope 1/2 accounting
npm run test:swarm       # Swarm orchestration
npm run test:connectors  # Schema-mapping connectors
```

## Docker

```bash
# SQLite (default)
make up

# With Ollama LLM backend
make up-ollama

# Stop
make down

# Logs
make logs
```

Services run on ports 8401-8406. See `docs/HTTP_QUICK_START.md` for HTTP API usage.

## Store Backends

Data persistence uses a pluggable store adapter (`shared-services/tools/store-adapter.js`):

| Backend | Config | Use Case |
|---------|--------|----------|
| File (JSON) | Default | Development, single-user |
| SQLite | `CARBONKIT_DB_BACKEND=sqlite` | Production single-node |

All backends implement `get`, `set`, `list`, `delete`, `bulkSet`, `count`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CARBONKIT_MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `CARBONKIT_MCP_PORT` | per-server | HTTP port when transport=http |
| `CARBONKIT_DB_BACKEND` | `file` | Store backend: `file` or `sqlite` |
| `CARBONKIT_AUTH_SECRET` | (none) | JWT secret for HTTP auth (required for production) |
| `CARBONKIT_CORS_ORIGIN` | `*` | CORS origin for HTTP mode (set explicitly in production) |
| `CARBONKIT_MAX_UPLOAD_BYTES` | `10485760` | Max upload size for REST gateway (10MB) |
| `CARBONKIT_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## Security Notes

- **Auth**: When `CARBONKIT_AUTH_SECRET` is unset, all HTTP endpoints are unauthenticated (open mode). Always set it for non-localhost deployments.
- **CORS**: Defaults to `*`. Set `CARBONKIT_CORS_ORIGIN` to your domain in production.
- **CLI trust boundary**: `carbon run` executes commands from plugin `.mcp.json` files. Only install plugins you trust -- a malicious plugin.json can run arbitrary code.

## Contributing

Contributions are welcome. Please open an issue to discuss proposed changes before submitting a pull request. Run `npm test` and `node plugins/test-mcp-servers.js` before submitting.

## License

[Apache-2.0](LICENSE)
