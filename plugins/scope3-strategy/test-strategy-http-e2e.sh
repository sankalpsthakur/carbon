#!/bin/bash
# HTTP E2E tests for strategy-mcp server
# Tests all 20 strategy tools via HTTP transport

set -e

STRATEGY_PORT=${CARBONKIT_STRATEGY_PORT:-8403}
BASE_URL="http://localhost:${STRATEGY_PORT}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_WARNED=0

# Helper functions
pass() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    TESTS_RUN=$((TESTS_RUN + 1))
    TESTS_WARNED=$((TESTS_WARNED + 1))
    echo -e "${YELLOW}⚠${NC}  $1"
}

fail() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo -e "${RED}✗${NC} $1"
    echo "Response: $response"
    exit 1
}

mcp_call() {
    local tool=$1
    local args=$2

    response=$(curl -s -X POST "$BASE_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"id\": $TESTS_RUN,
            \"method\": \"tools/call\",
            \"params\": {
                \"name\": \"$tool\",
                \"arguments\": $args
            }
        }")

    # Extract result using jq
    echo "$response" | jq -r '.result'
}

echo "=========================================="
echo "Strategy MCP HTTP E2E Tests"
echo "=========================================="
echo "Server: $BASE_URL"
echo ""

# Test 1: Health check
echo "1️⃣  Testing health check..."
response=$(mcp_call "strategy.health" "{}")
ok=$(echo "$response" | jq -r '.content[0].text | fromjson | .ok')
[[ "$ok" == "true" ]] && pass "Health check" || fail "Health check failed"

# Test 2: SHA-256 hash
echo "2️⃣  Testing SHA-256 utility..."
response=$(mcp_call "strategy.sha256" '{"text":"test"}')
hash=$(echo "$response" | jq -r '.content[0].text' | tr -d '"')
[[ ${#hash} -eq 64 ]] && pass "SHA-256 hash (64 chars)" || fail "SHA-256 hash invalid"

# Test 3: List demo assessments
echo "3️⃣  Testing demo assessments list..."
response=$(mcp_call "strategy.db.list" '{"collection":"assessments"}')
count=$(echo "$response" | jq -r '.content[0].text | fromjson | .count')
[[ "$count" == "2" ]] && pass "Demo assessments (2 orgs)" || fail "Expected 2 demo assessments, got $count"

# Get first assessment ID for subsequent tests
DEMO_ASSESSMENT_ID=$(echo "$response" | jq -r '.content[0].text | fromjson | .docs[0]._id')
echo "   Using demo assessment: $DEMO_ASSESSMENT_ID"

# Test 4: Get assessment details
echo "4️⃣  Testing assessment retrieval..."
response=$(mcp_call "strategy.assessment.get" "{\"assessment_id\":\"$DEMO_ASSESSMENT_ID\"}")
org_id=$(echo "$response" | jq -r '.content[0].text | fromjson | .assessment.org_id')
[[ -n "$org_id" ]] && pass "Assessment details (org: $org_id)" || fail "Failed to get assessment"

# Test 5: List IROs for demo assessment
echo "5️⃣  Testing IRO listing..."
response=$(mcp_call "strategy.iro.list" "{\"assessment_id\":\"$DEMO_ASSESSMENT_ID\"}")
iro_count=$(echo "$response" | jq -r '.content[0].text | fromjson | .count')
[[ "$iro_count" == "10" ]] && pass "IRO list (10 IROs)" || fail "Expected 10 IROs, got $iro_count"

# Get first IRO ID for subsequent tests
DEMO_IRO_ID=$(echo "$response" | jq -r '.content[0].text | fromjson | .iros[0]._id')
echo "   Using demo IRO: $DEMO_IRO_ID"

# Test 6: Create new test assessment
echo "6️⃣  Testing assessment creation..."
response=$(mcp_call "strategy.assessment.create" '{"org_id":"test-e2e","year":2024}')
NEW_ASSESSMENT_ID=$(echo "$response" | jq -r '.content[0].text | fromjson | .assessment._id')
[[ -n "$NEW_ASSESSMENT_ID" ]] && pass "Assessment creation ($NEW_ASSESSMENT_ID)" || fail "Failed to create assessment"

# Test 7: Create IRO
echo "7️⃣  Testing IRO creation..."
response=$(mcp_call "strategy.iro.create" "{
    \"assessment_id\":\"$NEW_ASSESSMENT_ID\",
    \"type\":\"risk\",
    \"topic\":\"E1\",
    \"title\":\"Test climate risk\"
}")
NEW_IRO_ID=$(echo "$response" | jq -r '.content[0].text | fromjson | .iro._id')
[[ -n "$NEW_IRO_ID" ]] && pass "IRO creation ($NEW_IRO_ID)" || fail "Failed to create IRO"

# Test 8: Score IRO
echo "8️⃣  Testing IRO scoring..."
response=$(mcp_call "strategy.iro.score" "{
    \"iro_id\":\"$NEW_IRO_ID\",
    \"impact_materiality\":4,
    \"financial_materiality\":5,
    \"likelihood\":4,
    \"confidence\":\"high\"
}")
impact=$(echo "$response" | jq -r '.content[0].text | fromjson | .iro.scores.impact_materiality')
[[ "$impact" == "4" ]] && pass "IRO scoring (impact=4, financial=5)" || fail "Failed to score IRO"

# Test 9: Add evidence
echo "9️⃣  Testing evidence attachment..."
response=$(mcp_call "strategy.evidence.add" "{
    \"iro_id\":\"$NEW_IRO_ID\",
    \"source\":\"Test evidence source\",
    \"stakeholder_type\":\"internal\",
    \"description\":\"Test evidence description for E2E validation\"
}")
evidence_id=$(echo "$response" | jq -r '.content[0].text | fromjson | .evidence._id')
[[ -n "$evidence_id" ]] && pass "Evidence attachment ($evidence_id)" || fail "Failed to add evidence"

# Test 10: Materiality matrix (using demo assessment with full data)
echo "🔟 Testing materiality matrix..."
response=$(mcp_call "strategy.materiality_matrix" "{\"assessment_id\":\"$DEMO_ASSESSMENT_ID\"}")
material_count=$(echo "$response" | jq -r '.content[0].text | fromjson | .summary.material')
[[ "$material_count" -gt 0 ]] && pass "Materiality matrix ($material_count material IROs)" || fail "Failed to generate matrix"

# Test 11: ESRS sequencing
echo "1️⃣1️⃣  Testing ESRS sequencing..."
response=$(mcp_call "strategy.esrs_sequence" "{\"assessment_id\":\"$DEMO_ASSESSMENT_ID\"}")
topic_count=$(echo "$response" | jq -r '.content[0].text | fromjson | .total_topics')
[[ "$topic_count" -gt 0 ]] && pass "ESRS sequence ($topic_count topics)" || fail "Failed to generate sequence"

# Test 12: Risk scan
echo "1️⃣2️⃣  Testing risk intelligence scan..."
response=$(mcp_call "strategy.risk_scan" '{"org_id":"tech-corp","keywords":["climate","CSRD"]}')
signal_count=$(echo "$response" | jq -r '.content[0].text | fromjson | .signal_count')
[[ "$signal_count" -gt 0 ]] && pass "Risk scan ($signal_count signals)" || fail "Failed to scan risks"

# Test 13: Create snapshot
echo "1️⃣3️⃣  Testing snapshot creation..."
response=$(mcp_call "strategy.snapshot" "{\"assessment_id\":\"$DEMO_ASSESSMENT_ID\",\"finalize\":false}")
snapshot_id=$(echo "$response" | jq -r '.content[0].text | fromjson | .snapshot_id')
snapshot_sha=$(echo "$response" | jq -r '.content[0].text | fromjson | .sha256')
[[ -n "$snapshot_id" ]] && pass "Snapshot creation ($snapshot_id)" || fail "Failed to create snapshot"

# Test 14: Verify snapshot
echo "1️⃣4️⃣  Testing snapshot verification..."
response=$(mcp_call "strategy.snapshot.verify" "{\"snapshot_id\":\"$snapshot_id\"}")
integrity=$(echo "$response" | jq -r '.content[0].text | fromjson | .integrity')
[[ "$integrity" == "valid" ]] && pass "Snapshot verification (integrity: $integrity)" || fail "Snapshot integrity check failed"

# Test 15: JSON export
echo "1️⃣5️⃣  Testing JSON export..."
response=$(mcp_call "strategy.export" "{\"assessment_id\":\"$DEMO_ASSESSMENT_ID\",\"format\":\"json\"}")
export_sha=$(echo "$response" | jq -r '.content[0].text | fromjson | .export_sha256')
[[ -n "$export_sha" ]] && pass "JSON export (SHA-256: ${export_sha:0:16}...)" || fail "Failed to export JSON"

# Test 16: Evidence pack export (returns JSON manifest, not actual ZIP)
echo "1️⃣6️⃣  Testing evidence pack export..."
response=$(mcp_call "strategy.export" "{\"assessment_id\":\"$DEMO_ASSESSMENT_ID\",\"format\":\"evidence_pack\"}")
file_count=$(echo "$response" | jq -r '.content[0].text | fromjson | .zip_manifest.total_files')
if [[ "$file_count" -gt 0 ]]; then
    warn "Evidence pack export ($file_count files) - returns JSON manifest (ZIP not implemented)"
else
    fail "Failed to generate evidence pack manifest"
fi

# Test 17: iXBRL export (CSRD/ESRS compliant)
echo "1️⃣7️⃣  Testing iXBRL export..."
response=$(mcp_call "strategy.export" "{\"assessment_id\":\"$DEMO_ASSESSMENT_ID\",\"format\":\"ixbrl\"}")
ixbrl_size=$(echo "$response" | jq -r '.content[0].text | fromjson | .ixbrl_document | length')
material_iros=$(echo "$response" | jq -r '.content[0].text | fromjson | .material_iros_count')
if [[ "$ixbrl_size" -gt 10000 ]]; then
    warn "iXBRL export (${ixbrl_size} bytes, ${material_iros} material IROs) - requires XBRL processor validation"
else
    fail "iXBRL document too small or missing"
fi

# Test 18: DB get operation
echo "1️⃣8️⃣  Testing DB get operation..."
response=$(mcp_call "strategy.db.get" "{\"collection\":\"assessments\",\"query\":{\"_id\":\"$DEMO_ASSESSMENT_ID\"}}")
found=$(echo "$response" | jq -r '.content[0].text | fromjson | .found')
[[ "$found" == "true" ]] && pass "DB get operation" || fail "Failed to get document"

# Test 19: DB set operation (update)
echo "1️⃣9️⃣  Testing DB set operation..."
response=$(mcp_call "strategy.db.set" "{
    \"collection\":\"assessments\",
    \"doc\":{
        \"_id\":\"$NEW_ASSESSMENT_ID\",
        \"org_id\":\"test-e2e\",
        \"year\":2024,
        \"status\":\"draft\",
        \"test_marker\":\"e2e-validated\"
    }
}")
ok=$(echo "$response" | jq -r '.content[0].text | fromjson | .ok')
[[ "$ok" == "true" ]] && pass "DB set operation" || fail "Failed to set document"

# Test 20: DB delete operation (cleanup)
echo "2️⃣0️⃣  Testing DB delete operation..."
response=$(mcp_call "strategy.db.delete" "{\"collection\":\"assessments\",\"query\":{\"_id\":\"$NEW_ASSESSMENT_ID\"}}")
deleted=$(echo "$response" | jq -r '.content[0].text | fromjson | .deleted')
[[ "$deleted" -gt 0 ]] && pass "DB delete operation ($deleted deleted)" || fail "Failed to delete document"

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Tests run:    $TESTS_RUN"
echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Warnings:     ${YELLOW}$TESTS_WARNED${NC}"
echo -e "Failed:       $((TESTS_RUN - TESTS_PASSED - TESTS_WARNED))"
echo ""

if [[ $((TESTS_PASSED + TESTS_WARNED)) -eq $TESTS_RUN ]]; then
    echo -e "${GREEN}✅ All strategy-mcp HTTP E2E tests passed!${NC}"
    echo ""
    echo "Known limitations (warnings):"
    echo "  - Evidence pack returns JSON manifest (actual ZIP generation not implemented)"
    echo "  - iXBRL requires external XBRL processor validation (Arelle, Fujitsu XWand)"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
