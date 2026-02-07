# E2E Test Execution Checklist

**Status**: Ready to Execute (Awaiting HTTP Transport)
**Branch**: `swarm5-qa`
**Prerequisites**: SWARM 1 HTTP transport implementation

---

## Pre-Execution Checklist

### 1. HTTP Transport Verification

- [ ] Confirm HTTP server running on `http://localhost:3000/api`
- [ ] Verify all 3 MCP servers exposed via HTTP
  - [ ] calc-mcp: `GET /calc/health` returns 200
  - [ ] exec-mcp: `GET /exec/health` returns 200
  - [ ] strategy-mcp: `GET /strategy/health` returns 200
- [ ] Verify JSON request/response format (not stdio)
- [ ] Verify CORS enabled (if needed for frontend tests)

### 2. Environment Setup

```bash
# Navigate to test directory
cd /Users/sankalp/Projects/experiment/carbon-swarm5-qa/plugins/test-e2e

# Install dependencies
npm install

# Set environment variables
export BASE_URL="http://localhost:3000/api"
export TEST_TIMEOUT=30000
export DEBUG="carbonkit:*"

# Verify test fixtures exist
ls fixtures/sample-spend-50rows.csv
```

### 3. Seed Test Data (Optional)

```bash
# Seed emission factors (if empty)
curl -X POST http://localhost:3000/api/calc/db/set \
  -H "Content-Type: application/json" \
  -d @fixtures/sample-emission-factors.json

# Seed suppliers (if empty)
curl -X POST http://localhost:3000/api/exec/db/set \
  -H "Content-Type: application/json" \
  -d @fixtures/sample-suppliers.json
```

---

## Test Execution Sequence

### Phase 1: Smoke Tests (5 minutes)

**Objective**: Verify all endpoints are reachable

```bash
# Health checks
npm run test:calc -- --grep "health"
npm run test:exec -- --grep "health"
npm run test:strategy -- --grep "health"

# Expected: 3/3 PASS
```

### Phase 2: Module Tests (15 minutes)

**Objective**: Test each module independently

```bash
# Calculation module (4 scenarios, ~100s)
npm run test:calc

# Execution module (4 scenarios, ~155s)
npm run test:exec

# Strategy module (2 scenarios, ~120s)
npm run test:strategy

# Expected: 10/10 PASS (excluding cross-module)
```

### Phase 3: Cross-Module Tests (5 minutes)

**Objective**: Validate data flow across modules

```bash
# Cross-module integration (2 scenarios, ~180s)
npm run test:cross

# Expected: 2/2 PASS
```

### Phase 4: Full Suite (20 minutes)

**Objective**: Run all tests with coverage

```bash
# Full suite with coverage report
npm run test:coverage

# Expected: 12/12 PASS
# Coverage: TBD (aim for >80% line coverage)
```

### Phase 5: Load Testing (2 minutes)

**Objective**: Measure performance under load

```bash
# Run Artillery load test
npm run load:test

# Expected:
# - p50: <120ms
# - p95: <380ms
# - p99: <520ms
# - Throughput: >150 req/sec
# - Error rate: 0%
```

---

## Test Results Template

### Execution Summary

| Phase | Tests | Pass | Fail | Duration | Status |
|-------|-------|------|------|----------|--------|
| Smoke Tests | 3 | - | - | - | ⏸️ |
| Calc Module | 4 | - | - | - | ⏸️ |
| Exec Module | 4 | - | - | - | ⏸️ |
| Strategy Module | 2 | - | - | - | ⏸️ |
| Cross-Module | 2 | - | - | - | ⏸️ |
| **Total** | **15** | **-** | **-** | **~20min** | **⏸️** |

### Performance Results

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| p50 latency | <120ms | - | ⏸️ |
| p95 latency | <380ms | - | ⏸️ |
| p99 latency | <520ms | - | ⏸️ |
| Throughput | >150 req/sec | - | ⏸️ |
| Error rate | 0% | - | ⏸️ |

### Known Limitations

**STUB Operations (Expected to Return Friendly Messages)**:
- [ ] `exec.render_page`: Returns poppler-utils install message
- [ ] `exec.ocr`: Returns tesseract install message
- [ ] `strategy.risk_scan`: Returns 6 hardcoded signals

**NOT IMPLEMENTED (Expected to Fail)**:
- [ ] `strategy.snapshot.verify`: Returns "not implemented" error

**Missing Infrastructure (Expected Behavior)**:
- [ ] PDF uploads: Store metadata only (no blob storage)
- [ ] Cross-module queries: Require manual foreign key linkage

---

## Failure Triage

### Common Failures

**1. Connection Refused**
```
Error: connect ECONNREFUSED 127.0.0.1:3000
```
**Fix**: Verify HTTP server is running, check BASE_URL

**2. 404 Not Found**
```
Error: 404 {"error": true, "message": "Endpoint not found"}
```
**Fix**: Verify endpoint path in OpenAPI spec, check routing

**3. Timeout**
```
Error: Timeout of 30000ms exceeded
```
**Fix**: Increase TEST_TIMEOUT, investigate slow operations

**4. Data Missing**
```
Error: No emission factors found
```
**Fix**: Seed test data using fixtures

**5. STUB Operation**
```
Note: PDF rendering requires poppler-utils
```
**Fix**: Expected behavior, not a failure (mark as PASS if message returned)

### Debug Commands

```bash
# Enable verbose logging
DEBUG=carbonkit:* npm run test

# Run single test
npm run test -- --grep "C-E2E-01"

# Skip cleanup (inspect DB state)
npm run test -- --no-exit

# Generate JUnit XML for CI
npm run test:ci
```

---

## Post-Execution Checklist

### 1. Generate Reports

```bash
# HTML report (Mochawesome)
npm run test:report
open reports/e2e-report.html

# Coverage report (c8)
npm run test:coverage
open coverage/index.html

# Load test report (Artillery)
cat load-test-report.json | jq '.aggregate'
```

### 2. Analyze Results

- [ ] All tests pass (12/12)?
- [ ] Performance targets met (p95 <380ms, p99 <520ms)?
- [ ] No unexpected failures?
- [ ] STUB operations behave as expected?
- [ ] Data consistency verified (FK integrity, audit trails)?

### 3. Document Issues

For each failure, create issue with:
- Test scenario ID (e.g., C-E2E-01)
- Error message + stack trace
- Steps to reproduce
- Expected vs actual behavior
- Severity (blocker/critical/major/minor)

### 4. Update Validation Matrix

```bash
# Mark tests as pass/fail in validation-matrix.json
# Update status field: "pending" → "pass" or "fail"
# Add notes for failures
```

### 5. Commit Results

```bash
cd /Users/sankalp/Projects/experiment/carbon-swarm5-qa

# Add test results
git add plugins/validation-matrix.json
git add test-results/
git add reports/

# Commit
git commit -m "test: E2E test execution results

- 12/12 scenarios executed
- Performance: p95 ${P95}ms, p99 ${P99}ms
- Throughput: ${TPS} req/sec
- Issues: ${ISSUE_COUNT}

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Success Criteria

### Phase 2 Complete ✅ (Once Executed)

- [ ] 12/12 E2E scenarios PASS
- [ ] 0 test failures (excluding known STUBs/NOT IMPLEMENTED)
- [ ] Performance targets met:
  - [ ] p50 <120ms
  - [ ] p95 <380ms
  - [ ] p99 <520ms
  - [ ] Throughput >150 req/sec
  - [ ] Error rate 0%
- [ ] Data consistency verified:
  - [ ] All foreign keys valid
  - [ ] Audit trails complete
  - [ ] Timestamps in ISO-8601
  - [ ] SHA-256 hashes 64-char hex
- [ ] Cross-module workflows validated:
  - [ ] Calc → Exec → Strategy (full chain)
  - [ ] Evidence flow across all 3 modules
- [ ] Test reports generated:
  - [ ] HTML report published
  - [ ] Coverage report >80%
  - [ ] Load test results documented
- [ ] Validation matrix updated (all actions marked pass/fail)

---

## Contact

**QA Specialist**: SWARM 5 (qa-specialist)
**Branch**: `swarm5-qa`
**Worktree**: `/Users/sankalp/Projects/experiment/carbon-swarm5-qa`

**Files**:
- Test Suite: `plugins/test-e2e/`
- Validation Matrix: `plugins/validation-matrix.json`
- OpenAPI Spec: `docs/openapi.yaml`
- QA Report: `docs/QA_VALIDATION_REPORT.md`
- This Checklist: `plugins/test-e2e/EXECUTION_CHECKLIST.md`

**Status**: Phase 1 Complete, Phase 2 Awaiting HTTP Transport
