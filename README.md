# Carbon

Open-source Claude Code SDK layer for end-to-end Scope 1/2/3 decarbonisation workflows.

11 plugins, 6 MCP servers (105 tools), 74 slash commands, 52 agents, 118 skills.

Implementation note: this SDK layer is delivered as a bundle of Claude Code plugins plus MCP servers (usable from Claude Code and other MCP clients).

Not to be confused with Anthropic's separate "Claude Agent SDK" library.

## Quick Start

```bash
git clone <repo-url> carbon && cd carbon

# Install dependencies
cd plugins && npm install

# Run smoke tests (6 MCP servers, 105 tools)
node test-mcp-servers.js

# Run all unit tests (253 tests)
node --test **/__tests__/*.test.js

# Validate all plugin manifests
node shared-services/tools/validate.js
```

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
# Install from npm (recommended)
npm i -g @sankalpsthakur/carbon
carbon <command>

# Or use without installing
npx @sankalpsthakur/carbon <command>

# From a git clone (repo-local wrapper)
./carbon <command>
```

Commands:

| Command | Description |
|---------|-------------|
| `carbon list` | List all 11 installed plugins |
| `carbon init <name>` | Scaffold a new plugin |
| `carbon run <plugin>:<tool>` | Spawn MCP server and call a tool |
| `carbon validate <plugin>` | Check plugin.json, commands, MCP health |
| `carbon export <plugin>:<job_id>` | Create audit bundle with hashes |
| `carbon help` | Show usage |

## Testing

```bash
cd plugins

# Smoke tests — starts each MCP server, sends initialize + tools/list + health
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

Postgres is planned but not yet supported. All backends implement `get`, `set`, `list`, `delete`, `bulkSet`, `count`.

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
- **CLI trust boundary**: `carbon run` executes commands from plugin `.mcp.json` files. Only install plugins you trust — a malicious plugin.json can run arbitrary code.

## License

Apache-2.0
