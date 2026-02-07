#!/bin/sh
# CarbonKit MCP servers entrypoint.
# Starts all MCP servers in HTTP transport mode concurrently.
# Each server reads CARBONKIT_MCP_TRANSPORT=http and its assigned port.

set -e

echo "Starting CarbonKit MCP servers..."
echo "  Transport: ${CARBONKIT_MCP_TRANSPORT:-http}"
echo "  Log level: ${CARBONKIT_LOG_LEVEL:-info}"

# Start each server in the background
CARBONKIT_MCP_PORT=8401 node /app/scope3-calculation/tools/calc-mcp.js &
echo "  [calc]     port 8401 - PID $!"

CARBONKIT_MCP_PORT=8402 node /app/scope3-execution/tools/exec-mcp.js &
echo "  [exec]     port 8402 - PID $!"

CARBONKIT_MCP_PORT=8403 node /app/scope3-strategy/tools/strategy-mcp.js &
echo "  [strategy] port 8403 - PID $!"

# scope12, swarm, connectors -- start only if the server file exists
if [ -f /app/scope12-accounting/tools/scope12-mcp.js ]; then
  CARBONKIT_MCP_PORT=8404 node /app/scope12-accounting/tools/scope12-mcp.js &
  echo "  [scope12]  port 8404 - PID $!"
fi

if [ -f /app/swarms/tools/swarm-mcp.js ]; then
  CARBONKIT_MCP_PORT=8405 node /app/swarms/tools/swarm-mcp.js &
  echo "  [swarm]    port 8405 - PID $!"
fi

if [ -f /app/connectors/tools/connectors-mcp.js ]; then
  CARBONKIT_MCP_PORT=8406 node /app/connectors/tools/connectors-mcp.js &
  echo "  [connectors] port 8406 - PID $!"
fi

echo "All available MCP servers started."

# Wait for any child to exit (keeps container alive)
wait
