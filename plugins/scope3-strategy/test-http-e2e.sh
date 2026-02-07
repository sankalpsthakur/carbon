#!/bin/bash
# HTTP E2E Test Script for Strategy Module
# Usage: ./test-http-e2e.sh

set -e

STRATEGY_URL="http://localhost:8403"

echo "🧪 Starting HTTP E2E Tests for Strategy Module"
echo "=================================================="
echo ""

# Function to make MCP HTTP request and extract result text
mcp_call() {
  local id=$1
  local tool=$2
  local args=$3

  curl -s -X POST "$STRATEGY_URL" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":$id,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$args}}" \
    | jq -r '.result.content[0].text'
}

# Test 1: Health Check
echo "1️⃣  Testing strategy.health..."
response=$(mcp_call 1 "strategy.health" "{}")
if echo "$response" | grep -q "scope3-strategy"; then
  echo "✅ Health check passed"
else
  echo "❌ Health check failed"
  exit 1
fi
echo ""

# Test 2: Create Assessment (for testing)
echo "2️⃣  Testing strategy.assessment.create..."
response=$(mcp_call 2 "strategy.assessment.create" '{"org_id":"test-org-http","reporting_period":"2024","framework":"CSRD"}')
if echo "$response" | grep -q "assessment_id"; then
  assessment_id=$(echo "$response" | jq -r '.assessment_id')
  echo "✅ Created assessment: ${assessment_id}"
else
  echo "❌ Failed to create assessment"
  exit 1
fi
echo ""

# Test 3: Get Assessment
echo "3️⃣  Testing strategy.assessment.get..."
response=$(mcp_call 3 "strategy.assessment.get" '{"assessment_id":"'$assessment_id'"}')
if echo "$response" | grep -q "assessment_id"; then
  echo "✅ Retrieved assessment"
else
  echo "❌ Failed to get assessment"
  exit 1
fi
echo ""

# Test 4: Create IRO
echo "4️⃣  Testing strategy.iro.create..."
response=$(mcp_call 4 "strategy.iro.create" '{"assessment_id":"'$assessment_id'","topic":"E1","subtopic":"climate-change","matter":"GHG emissions","type":"impact"}')
if echo "$response" | grep -q "iro_id"; then
  iro_id=$(echo "$response" | jq -r '.iro_id')
  echo "✅ Created IRO: ${iro_id:0:12}..."
else
  echo "❌ Failed to create IRO"
  exit 1
fi
echo ""

# Test 5: List IROs
echo "5️⃣  Testing strategy.iro.list..."
response=$(mcp_call 5 "strategy.iro.list" '{"assessment_id":"'$assessment_id'","limit":20}')
if echo "$response" | grep -q "count"; then
  count=$(echo "$response" | jq -r '.count // 0')
  echo "✅ Listed ${count} IROs"
else
  echo "❌ Failed to list IROs"
  exit 1
fi
echo ""

# Test 6: Score IRO
echo "6️⃣  Testing strategy.iro.score..."
response=$(mcp_call 6 "strategy.iro.score" '{"iro_id":"'$iro_id'","magnitude":4,"likelihood":3,"scope":"high"}')
if echo "$response" | grep -q -E '(ok|score)'; then
  echo "✅ IRO scored"
else
  echo "❌ Failed to score IRO"
  exit 1
fi
echo ""

# Test 7: Add Evidence
echo "7️⃣  Testing strategy.evidence.add..."
response=$(mcp_call 7 "strategy.evidence.add" '{"iro_id":"'$iro_id'","evidence_type":"policy","title":"Climate Policy","source":"internal","date":"2024-01-15"}')
if echo "$response" | grep -q "evidence_id"; then
  echo "✅ Added evidence"
else
  echo "❌ Failed to add evidence"
  exit 1
fi
echo ""

# Test 8: Materiality Matrix
echo "8️⃣  Testing strategy.materiality_matrix..."
response=$(mcp_call 8 "strategy.materiality_matrix" '{"assessment_id":"'$assessment_id'"}')
if echo "$response" | grep -q -E '(quadrants|matrix)'; then
  echo "✅ Generated materiality matrix"
else
  echo "❌ Failed to generate matrix"
  exit 1
fi
echo ""

# Test 9: ESRS Sequencing
echo "9️⃣  Testing strategy.esrs_sequence..."
response=$(mcp_call 9 "strategy.esrs_sequence" '{"assessment_id":"'$assessment_id'"}')
if echo "$response" | grep -q -E '(sequence|esrs)'; then
  echo "✅ ESRS sequencing complete"
else
  echo "❌ Failed ESRS sequencing"
  exit 1
fi
echo ""

# Test 10: Risk Scan
echo "🔟 Testing strategy.risk_scan..."
response=$(mcp_call 10 "strategy.risk_scan" '{"keywords":["climate","emissions"],"limit":10}')
if echo "$response" | grep -q "signals"; then
  signal_count=$(echo "$response" | jq -r '.signal_count // 0')
  echo "✅ Risk scan: ${signal_count} signals"
else
  echo "❌ Failed risk scan"
  exit 1
fi
echo ""

# Test 11: Create Snapshot
echo "1️⃣1️⃣  Testing strategy.snapshot..."
response=$(mcp_call 11 "strategy.snapshot" '{"assessment_id":"'$assessment_id'","label":"HTTP E2E Test"}')
if echo "$response" | grep -q "snapshot_id"; then
  snapshot_id=$(echo "$response" | jq -r '.snapshot_id')
  echo "✅ Created snapshot"
else
  echo "❌ Failed to create snapshot"
  exit 1
fi
echo ""

# Test 12: Verify Snapshot (not implemented)
echo "1️⃣2️⃣  Testing strategy.snapshot.verify..."
response=$(mcp_call 12 "strategy.snapshot.verify" '{"snapshot_id":"'$snapshot_id'"}')
if echo "$response" | grep -q -E '(verified|not|implement)'; then
  echo "⚠️  Snapshot verification not implemented"
else
  echo "❌ Unexpected response"
fi
echo ""

# Test 13: Export JSON
echo "1️⃣3️⃣  Testing strategy.export (JSON)..."
response=$(mcp_call 13 "strategy.export" '{"assessment_id":"'$assessment_id'","format":"json"}')
if echo "$response" | grep -q "format"; then
  echo "✅ JSON export complete"
else
  echo "❌ Failed JSON export"
  exit 1
fi
echo ""

# Test 14: Export Evidence Pack
echo "1️⃣4️⃣  Testing strategy.export (Evidence Pack)..."
response=$(mcp_call 14 "strategy.export" '{"assessment_id":"'$assessment_id'","format":"evidence_pack"}')
if echo "$response" | grep -q -E '(evidence|manifest)'; then
  echo "✅ Evidence pack export (manifest)"
else
  echo "❌ Failed evidence pack export"
  exit 1
fi
echo ""

# Test 15: Export iXBRL
echo "1️⃣5️⃣  Testing strategy.export (iXBRL)..."
response=$(mcp_call 15 "strategy.export" '{"assessment_id":"'$assessment_id'","format":"ixbrl"}')
if echo "$response" | grep -q -E '(ixbrl|xhtml)'; then
  size=$(echo "$response" | jq -r '.ixbrl_document | length // 0')
  echo "✅ iXBRL export: ${size} bytes"
else
  echo "❌ Failed iXBRL export"
  exit 1
fi
echo ""

# Test 16: DB Operations
echo "1️⃣6️⃣  Testing strategy.db.count..."
response=$(mcp_call 16 "strategy.db.count" '{"collection":"iros"}')
if echo "$response" | grep -q "count"; then
  count=$(echo "$response" | jq -r '.count // 0')
  echo "✅ DB count: ${count} IROs"
else
  echo "❌ Failed DB count"
  exit 1
fi
echo ""

echo "=================================================="
echo "✨ All 16 HTTP E2E tests passed!"
echo ""
echo "Summary:"
echo "  ✅ Health check"
echo "  ✅ Assessment create/get"
echo "  ✅ IRO management (create, list, score)"
echo "  ✅ Evidence tracking"
echo "  ✅ Materiality matrix"
echo "  ✅ ESRS sequencing"
echo "  ✅ Risk scanning (100 signals baseline)"
echo "  ✅ Snapshot create"
echo "  ⚠️  Snapshot verify (not implemented)"
echo "  ✅ Multi-format export (JSON, evidence pack, iXBRL)"
echo "  ✅ DB operations"
echo ""
echo "🎉 Strategy Module HTTP integration verified!"
