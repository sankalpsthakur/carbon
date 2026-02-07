# CarbonKit HTTP Mode - Quick Start

## 🚀 Start All Servers (One Command)

```bash
cd plugins/shared-services/tools
./test-http-mode.sh
```

This starts:
- REST Gateway on port **8400**
- All 6 MCP servers on ports **8401-8406**

## 📍 API Endpoints

### REST Gateway (port 8400)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingestion-jobs/upload` | Upload CSV for ingestion |
| `GET` | `/api/ingestion-jobs/:jobId` | Get ingestion job status |
| `POST` | `/api/emission-factors` | Add emission factor |
| `GET` | `/api/emission-factors` | List emission factors |
| `POST` | `/api/tools/call` | Call any MCP tool |
| `GET` | `/health` | Gateway health check |

### Direct MCP Servers

| Server | Port | Example |
|--------|------|---------|
| calc | 8401 | `POST http://localhost:8401` |
| exec | 8402 | `POST http://localhost:8402` |
| strategy | 8403 | `POST http://localhost:8403` |
| scope12 | 8404 | `POST http://localhost:8404` |
| swarm | 8405 | `POST http://localhost:8405` |
| connectors | 8406 | `POST http://localhost:8406` |

## 💻 Example Requests

### Upload CSV for Ingestion
```bash
curl -X POST http://localhost:8400/api/ingestion-jobs/upload \
  -F "file=@spend_data.csv" \
  -F "basis=spend" \
  -F "currency=USD"
```

### List Emission Factors
```bash
curl http://localhost:8400/api/emission-factors
```

### Generic Tool Call
```bash
curl -X POST http://localhost:8400/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "server": "calc",
    "method": "calc.compute_emissions",
    "arguments": {
      "activity_id": "123",
      "method": "spend"
    }
  }'
```

### Direct MCP Call
```bash
curl -X POST http://localhost:8401 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "calc.list_emission_factors",
      "arguments": {}
    }
  }'
```

## 🔑 With Authentication

```bash
# 1. Set secret
export CARBONKIT_AUTH_SECRET="your-secret-key"

# 2. Generate token (24h TTL)
TOKEN=$(node -e "
const { initAuth } = require('./plugins/shared-services/tools/auth');
console.log(initAuth('your-secret-key'));
")

# 3. Use token
curl -X POST http://localhost:8400/api/tools/call \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"server":"calc","method":"calc.health","arguments":{}}'
```

## 🌐 Frontend (React)

```javascript
const API_URL = 'http://localhost:8400';

// Upload CSV
async function uploadCSV(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('basis', 'spend');
  formData.append('currency', 'USD');

  const response = await fetch(`${API_URL}/api/ingestion-jobs/upload`, {
    method: 'POST',
    body: formData,
  });

  return response.json();
}

// List emission factors
async function getEmissionFactors() {
  const response = await fetch(`${API_URL}/api/emission-factors`);
  return response.json();
}

// Generic tool call
async function callTool(server, method, args) {
  const response = await fetch(`${API_URL}/api/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server, method, arguments: args }),
  });

  return response.json();
}
```

## ⚙️ Environment Variables

```bash
# Enable HTTP mode (required)
export CARBONKIT_MCP_TRANSPORT=http

# Optional: Custom ports
export CARBONKIT_GATEWAY_PORT=8400
export CARBONKIT_CALC_PORT=8401
export CARBONKIT_EXEC_PORT=8402

# Optional: Authentication
export CARBONKIT_AUTH_SECRET="your-secret-key"

# Optional: CORS (default: *)
export CARBONKIT_CORS_ORIGIN="http://localhost:3000"

# Optional: Logging
export CARBONKIT_LOG_LEVEL=debug  # debug, info, warn, error
```

## 🔧 Troubleshooting

### Port already in use
```bash
# Kill all CarbonKit servers
for port in 8400 8401 8402 8403 8404 8405 8406; do
  lsof -ti:$port | xargs kill -9 2>/dev/null || true
done
```

### Server not responding
```bash
# Check if server is running
lsof -i:8401

# Check logs
tail -f /tmp/calc-mcp.log
```

### Disable auth for testing
```bash
unset CARBONKIT_AUTH_SECRET
```

## 📚 Full Documentation

See [HTTP_INFRASTRUCTURE.md](./HTTP_INFRASTRUCTURE.md) for:
- Architecture details
- Security configuration
- Frontend integration patterns
- Complete API reference
- Performance considerations

## ✅ Verification

Test that HTTP mode is working:

```bash
# Health check
curl http://localhost:8400/health

# Initialize calc-mcp
curl -X POST http://localhost:8401 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "serverInfo": {
      "name": "scope3-calculation-mcp",
      "version": "0.4.1"
    }
  }
}
```
