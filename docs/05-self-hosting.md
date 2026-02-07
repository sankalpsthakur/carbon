# 05: Self-Hosting Infrastructure

## Overview

Workstream 5 makes CarbonKit deployable on private infrastructure with one command. Covers Docker containerization, MCP HTTP transport, LLM backend abstraction, JWT auth, observability, and backup/restore.

---

## Docker Compose Services

### Default Stack (Current Repo)

This repo ships `docker-compose.yml` with **6 MCP server services**:

- `mcp-calc` (8401)
- `mcp-exec` (8402)
- `mcp-strategy` (8403)
- `mcp-scope12` (8404)
- `mcp-swarm` (8405)
- `mcp-connectors` (8406)

Each server runs with:
- `CARBONKIT_MCP_TRANSPORT=http`
- `CARBONKIT_MCP_PORT=<port>`
- `CARBONKIT_DB_BACKEND=sqlite` (recommended for Docker)

### Postgres Overlay (Not Supported Yet)

`docker-compose.postgres.yml` is retained as a placeholder, but the Postgres backend is currently not supported by the SDK layer.

### Ollama GPU Overlay

```yaml
# docker-compose.ollama.yml
# Applied automatically when NVIDIA GPU detected
services:
  ollama:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

---

## MCP HTTP Transport

### `shared-services/tools/mcp-http-transport.js`

Wraps existing stdio MCP handlers behind a Node HTTP server. Each MCP server gets a 5-line addition:

```javascript
// At bottom of each MCP server file:
if (process.env.CARBONKIT_MCP_TRANSPORT === 'http') {
  const { startHttpTransport } = require('../../shared-services/tools/mcp-http-transport');
  startHttpTransport(handleRequest, parseInt(process.env.CARBONKIT_MCP_PORT || '8401'));
} else {
  // existing stdio transport (unchanged)
}
```

### Port Assignments

| Server | Port | Env Variable |
|--------|------|-------------|
| calc-mcp | 8401 | `CARBONKIT_MCP_PORT` |
| exec-mcp | 8402 | `CARBONKIT_MCP_PORT` |
| strategy-mcp | 8403 | `CARBONKIT_MCP_PORT` |
| scope12-mcp | 8404 | `CARBONKIT_MCP_PORT` |
| swarm-mcp | 8405 | `CARBONKIT_MCP_PORT` |
| connectors-mcp | 8406 | `CARBONKIT_MCP_PORT` |

### HTTP Protocol

- `POST /rpc` -- JSON-RPC 2.0 request/response
- `GET /health` -- Health check endpoint
- `Authorization: Bearer <jwt>` -- Optional auth header
- Content-Type: `application/json`

---

## LLM Backend Abstraction

### `shared-services/tools/llm-router.js`

OpenAI-compatible proxy routing to configured backend.

```javascript
const router = createLLMRouter({
  backend: process.env.CARBONKIT_LLM_BACKEND || 'anthropic',
  url: process.env.CARBONKIT_LLM_URL,
  model: process.env.CARBONKIT_LLM_MODEL,
  apiKey: process.env.CARBONKIT_LLM_API_KEY,
});

// Unified interface:
const response = await router.chat({
  messages: [{ role: 'user', content: 'Analyze this spend data...' }],
  tools: availableTools,
  temperature: 0.1,
});
```

### Supported Backends

| Backend | URL | Model Examples |
|---------|-----|---------------|
| `anthropic` | `https://api.anthropic.com` | claude-sonnet-4-5-20250929, claude-opus-4-6 |
| `ollama` | `http://localhost:11434` | llama3.1:8b, mistral:7b, codellama:13b |
| `vllm` | `http://localhost:8000` | Any HuggingFace model |
| `llamacpp` | `http://localhost:8080` | Any GGUF model |
| `openai` | `https://api.openai.com` | gpt-4o, gpt-4o-mini |

All backends use OpenAI-compatible `/v1/chat/completions` format. Anthropic backend translates internally.

### `shared-services/tools/agent-runtime.js`

Standalone agent execution loop for Docker deployment:

```javascript
const runtime = createAgentRuntime({
  agentPath: 'scope3-calculation/agents/spend-baseline-operator.md',
  mcpServers: {
    calc: 'http://mcp-servers:8401',
    exec: 'http://mcp-servers:8402',
  },
  llmRouter: router,
});

await runtime.execute({ task: 'Ingest and compute emissions', inputs: { ... } });
```

---

## Auth & Privacy

### `shared-services/tools/auth.js`

Local JWT bearer token authentication using HS256.

```javascript
const { generateToken, validateToken, authMiddleware } = require('./auth');

// Generate token (stored at ~/.carbonkit/auth-token)
const token = generateToken(secret, { sub: 'admin', workspace: 'default' });

// Validate token
const payload = validateToken(secret, token);

// Express/HTTP middleware
const handler = authMiddleware(secret)(req, res, next);
```

### Privacy Controls

| Environment Variable | Default | Effect |
|---------------------|---------|--------|
| `CARBONKIT_TELEMETRY` | `off` | No usage telemetry sent anywhere |
| `CARBONKIT_OFFLINE` | `true` | Zero outbound network connections |
| `CARBONKIT_AUTH_SECRET` | auto-generated | JWT signing secret |
| `CARBONKIT_WORKSPACE` | `default` | Workspace isolation (separate DB) |

### Workspace Isolation

Each workspace gets a separate database:
- SQLite: `~/.carbonkit/data/{workspace}.db`
- Postgres: schema per workspace (`SET search_path TO {workspace}`)

---

## Observability

### `shared-services/tools/logger.js`

Structured JSON logging via pino.

```javascript
const log = createLogger({ name: 'calc-mcp', level: process.env.LOG_LEVEL || 'info' });

log.info({ tool: 'calc.compute', job_id: 'abc' }, 'Starting computation');
log.error({ tool: 'calc.compute', error: err.message }, 'Computation failed');
```

### `shared-services/tools/metrics.js`

Prometheus-compatible metrics endpoint.

| Metric | Type | Description |
|--------|------|-------------|
| `carbonkit_tool_calls_total` | Counter | Tool invocations by server and tool name |
| `carbonkit_tool_duration_seconds` | Histogram | Tool execution time |
| `carbonkit_store_operations_total` | Counter | Store operations by type (get/set/delete/list) |
| `carbonkit_active_swarm_runs` | Gauge | Currently running swarm workflows |
| `carbonkit_errors_total` | Counter | Errors by server and error code |

Exposed at `GET /metrics` on each MCP server (HTTP transport only).

---

## One-Command Setup

### Makefile Targets

```makefile
# Default: SQLite + Ollama (fully offline)
make up

# With Anthropic API (cloud LLM)
make up-ollama

# Run all tests
make test

# Backup database
make backup

# Migrate from FileStore to SQLite
make migrate

# Stop all services
make down

# View logs
make logs

# Shell into mcp-servers container
make shell
```

### `.env.example`

```env
# Database
CARBONKIT_DB_BACKEND=sqlite
CARBONKIT_SQLITE_PATH=/home/node/.carbonkit/data/carbonkit.db
# CARBONKIT_PG_URL=postgres://carbonkit:password@localhost:5432/carbonkit

# LLM
CARBONKIT_LLM_BACKEND=ollama
CARBONKIT_LLM_URL=http://ollama:11434
CARBONKIT_LLM_MODEL=llama3.1:8b
# CARBONKIT_LLM_API_KEY=sk-...

# Auth
CARBONKIT_AUTH_SECRET=change-me-in-production

# Privacy
CARBONKIT_TELEMETRY=off
CARBONKIT_OFFLINE=true

# Logging
LOG_LEVEL=info
```

---

## Backup & Restore

### SQLite Backup

```bash
carbonkit backup
# 1. PRAGMA wal_checkpoint(TRUNCATE)
# 2. cp carbonkit.db -> ~/.carbonkit/backups/carbonkit-YYYYMMDD-HHMMSS.db
# 3. Log backup event to audit trail
```

### Restore

```bash
carbonkit restore --from ~/.carbonkit/backups/carbonkit-20240115-143022.db
# 1. Stop MCP servers
# 2. cp backup -> carbonkit.db
# 3. Restart MCP servers
# 4. Verify health checks
```

### Automated Backup (cron)

```bash
# Add to docker-compose for daily backup
backup:
  image: alpine
  volumes:
    - carbonkit-data:/data
    - carbonkit-backups:/backups
  command: >
    sh -c 'cp /data/data/carbonkit.db /backups/carbonkit-$(date +%Y%m%d).db'
  # Triggered by Docker's built-in cron or external scheduler
```
