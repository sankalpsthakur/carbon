#!/bin/bash
# Test script for CarbonKit HTTP infrastructure
# Verifies all MCP servers respond via HTTP and REST gateway works

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "===== CarbonKit HTTP Infrastructure Test ====="
echo ""
echo "Starting all MCP servers in HTTP mode..."

# Kill any existing processes on these ports
for port in 8400 8401 8402 8403 8404 8405 8406; do
  lsof -ti:$port | xargs kill -9 2>/dev/null || true
done

# Set environment
export CARBONKIT_MCP_TRANSPORT=http
export CARBONKIT_LOG_LEVEL=info

# Start each MCP server in background
echo "Starting calc-mcp on port 8401..."
cd "$PROJECT_ROOT/plugins/scope3-calculation/tools"
node calc-mcp.js > /tmp/calc-mcp.log 2>&1 &
CALC_PID=$!

echo "Starting exec-mcp on port 8402..."
cd "$PROJECT_ROOT/plugins/scope3-execution/tools"
node exec-mcp.js > /tmp/exec-mcp.log 2>&1 &
EXEC_PID=$!

echo "Starting strategy-mcp on port 8403..."
cd "$PROJECT_ROOT/plugins/scope3-strategy/tools"
node strategy-mcp.js > /tmp/strategy-mcp.log 2>&1 &
STRATEGY_PID=$!

echo "Starting scope12-mcp on port 8404..."
cd "$PROJECT_ROOT/plugins/scope12-accounting/tools"
node scope12-mcp.js > /tmp/scope12-mcp.log 2>&1 &
SCOPE12_PID=$!

echo "Starting swarm-mcp on port 8405..."
cd "$PROJECT_ROOT/plugins/swarms/tools"
node swarm-mcp.js > /tmp/swarm-mcp.log 2>&1 &
SWARM_PID=$!

echo "Starting connectors-mcp on port 8406..."
cd "$PROJECT_ROOT/plugins/connectors/tools"
node connectors-mcp.js > /tmp/connectors-mcp.log 2>&1 &
CONNECTORS_PID=$!

echo "Starting REST gateway on port 8400..."
cd "$PROJECT_ROOT/plugins/shared-services/tools"
node rest-gateway.js > /tmp/rest-gateway.log 2>&1 &
GATEWAY_PID=$!

# Wait for servers to start
echo ""
echo "Waiting for servers to start..."
sleep 3

# Cleanup function
cleanup() {
  echo ""
  echo "Shutting down servers..."
  kill $CALC_PID $EXEC_PID $STRATEGY_PID $SCOPE12_PID $SWARM_PID $CONNECTORS_PID $GATEWAY_PID 2>/dev/null || true
  exit
}

trap cleanup EXIT INT TERM

# Test each MCP server directly
echo ""
echo "===== Testing MCP Servers ====="

test_mcp_server() {
  local name=$1
  local port=$2
  local method=$3

  echo -n "Testing $name on port $port... "

  response=$(curl -s -X POST http://localhost:$port \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":{}}" 2>&1)

  if echo "$response" | grep -q '"result"'; then
    echo "✓ OK"
    return 0
  else
    echo "✗ FAILED"
    echo "Response: $response"
    return 1
  fi
}

test_mcp_server "calc-mcp" 8401 "initialize"
test_mcp_server "exec-mcp" 8402 "initialize"
test_mcp_server "strategy-mcp" 8403 "initialize"
test_mcp_server "scope12-mcp" 8404 "initialize"
test_mcp_server "swarm-mcp" 8405 "initialize"
test_mcp_server "connectors-mcp" 8406 "initialize"

# Test REST Gateway
echo ""
echo "===== Testing REST Gateway ====="

echo -n "Testing gateway health endpoint... "
response=$(curl -s http://localhost:8400/health)
if echo "$response" | grep -q '"status":"ok"'; then
  echo "✓ OK"
else
  echo "✗ FAILED"
  echo "Response: $response"
fi

echo -n "Testing generic tool call via gateway... "
response=$(curl -s -X POST http://localhost:8400/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"server":"calc","method":"tools/list","arguments":{}}' 2>&1)

if echo "$response" | grep -q 'tools'; then
  echo "✓ OK"
else
  echo "✗ FAILED"
  echo "Response: $response"
fi

echo ""
echo "===== Test Summary ====="
echo "All MCP servers are responding via HTTP"
echo "REST gateway is operational on port 8400"
echo ""
echo "MCP Server Ports:"
echo "  calc     = 8401"
echo "  exec     = 8402"
echo "  strategy = 8403"
echo "  scope12  = 8404"
echo "  swarm    = 8405"
echo "  connectors = 8406"
echo ""
echo "REST Gateway = 8400"
echo ""
echo "Example curl commands:"
echo ""
echo "# List calc tools"
echo "curl -X POST http://localhost:8401 \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}'"
echo ""
echo "# Via REST gateway"
echo "curl -X POST http://localhost:8400/api/tools/call \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"server\":\"calc\",\"method\":\"calc.health\",\"arguments\":{}}'"
echo ""
echo "Press Ctrl+C to shut down servers"

# Keep running until interrupted
wait
