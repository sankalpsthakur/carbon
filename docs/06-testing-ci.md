# 06: Testing & CI Pipeline

## Overview

Workstream 6 builds a comprehensive test suite and CI pipeline. Tests are organized by MCP server with shared fixtures. CI runs on every push and pull request with parallel jobs for validation, unit tests, and Docker build verification.

---

## Test Categories

### 1. Smoke Tests (existing: `test-mcp-servers.js`)

Verifies each MCP server starts, responds to `initialize`, lists expected tool count, and passes health check. Already functional for calc, exec, strategy. Extended to include scope12, swarm, and connectors.

### 2. Unit Tests (per-server `__tests__/*.test.js`)

Each MCP server has a dedicated test file that spawns the server in a subprocess, sends JSON-RPC requests via stdio framing, and validates responses.

| Test File | Coverage |
|-----------|----------|
| `shared-services/tools/__tests__/store-adapter.test.js` | CRUD operations (get, set, list, delete), bulkSet, count, concurrent reads, audit logging, timestamp normalization, empty-query guard, migration roundtrip |
| `scope3-calculation/tools/__tests__/calc-mcp.test.js` | Ingest (flag detection, reconciliation), compute (all 4 method tiers), FX normalization (cross-rate, custom override), DQS scoring, export (CSV + JSON), factor matching (exact/category/fallback), CSV RFC 4180 escaping |
| `scope3-execution/tools/__tests__/exec-mcp.test.js` | Pipeline stages (real processing), PDF render (with/without pdfjs), OCR (with/without tesseract.js), upload PDF (base64 + file path), maturity scoring, quality gates (all 5), provenance chain, rate limiting |
| `scope3-strategy/tools/__tests__/strategy-mcp.test.js` | Assessment lifecycle (create -> IRO -> score -> evidence -> snapshot -> export), materiality matrix (all 4 quadrants), snapshot verify (match + drift detection), risk scan (keyword filtering, signal scoring), evidence dedup, finalization guard |
| `scope12-accounting/tools/__tests__/scope12-mcp.test.js` | Scope 1 all 4 source types with known expected results, GWP application (AR5 vs AR6), biogenic CO2 separation, Scope 2 dual ledger, market-based hierarchy, evidence validation (16 fields), KPI normalization (all 5), coverage ratio gate, period close with restatement |
| `swarms/tools/__tests__/swarm-mcp.test.js` | YAML validation (valid + invalid), DAG resolution (cycle detection, topological sort), stage execution, merge strategies (collect, reduce, chain, vote), gate checks (all 4 types), self-healing (retry, reassign, skip), deliverable assembly |
| `connectors/tools/__tests__/connectors-mcp.test.js` | Schema mapping (all 10 configs), NAICS crosswalk (MCC -> NAICS -> EEIO), CSV/Excel ingest (happy path + malformed), preview mode, validation (missing fields, type mismatches) |

### 3. Integration Tests

End-to-end flows that chain multiple tools across servers:

| Test | Flow |
|------|------|
| Spend-to-emissions | CSV -> connectors.ingest -> calc.ingest -> calc.compute -> calc.export |
| PDF-to-provenance | exec.upload_pdf -> exec.render_page -> exec.ocr -> exec.provenance.save |
| Assessment lifecycle | strategy.assessment.create -> iro.create -> iro.score -> evidence.add -> snapshot -> snapshot.verify |
| Scope 1+2 close | scope12.scope1.calculate -> scope12.scope2.calculate -> scope12.kpi.normalize -> scope12.period.close |

---

## Fixture Data

All fixtures live in `plugins/test-fixtures/`.

### sample-spend.json

20 representative spend rows covering diverse vendors, currencies, categories, and amounts. Includes edge cases: missing vendor, missing description, zero amount, non-USD currency.

### sample-factors.json

10 emission factors covering all 4 method bases:
- `supplier_primary`: 2 factors (with vendor-specific kgCO2e)
- `avg_quantity`: 3 factors (kgCO2e per unit)
- `spend`: 4 factors (kgCO2e per USD)
- `none`: 1 factor (zero/missing)

### sample-scope1-sources.json

4 source types with known expected results:
- Stationary: 100 m3 natural gas -> ~188 kgCO2e
- Mobile: 1000 L diesel -> ~2,680 kgCO2e
- Process: 1 tonne cement clinker -> ~525 kgCO2e
- Fugitive: 10 kg R-134a @ 50% recovery -> ~7,630 kgCO2e

### sample-scope2-sites.json

2 sites:
- Site A: 500 MWh electricity, grid region SRSO, no contractual instruments (location-based only)
- Site B: 300 MWh electricity + 50 GJ steam, with PPA evidence (market-based = 0)

### sample-gwp-ar6.json

AR6 GWP-100 table for common gases: CO2, CH4 (fossil), CH4 (biogenic), N2O, HFC-32, HFC-134a, HFC-143a, R-410A, SF6, NF3, PFC-14, PFC-116.

---

## CI Pipeline

### `.github/workflows/ci.yml`

```yaml
name: CarbonKit CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  validate:
    name: Validate Bundle
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd plugins && npm ci
      - name: Validate plugin manifests
        run: node plugins/shared-services/tools/validate-plugins.js
      - name: MCP server selftest
        run: node plugins/test-mcp-servers.js

  test:
    name: Test Suite
    runs-on: ubuntu-latest
    needs: validate
    strategy:
      matrix:
        server: [store-adapter, calc-mcp, exec-mcp, strategy-mcp, scope12-mcp, swarm-mcp, connectors-mcp]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd plugins && npm ci
      - name: Run tests
        run: node plugins/${{ matrix.server }}/tools/__tests__/${{ matrix.server }}.test.js
        env:
          CARBONKIT_DB_BACKEND: sqlite
          CARBONKIT_SQLITE_PATH: /tmp/test-carbonkit.db

  docker-build:
    name: Docker Build
    runs-on: ubuntu-latest
    needs: validate
    steps:
      - uses: actions/checkout@v4
      - name: Build MCP servers image
        run: docker build -f docker/Dockerfile.mcp-servers -t carbonkit-mcp:test .
      - name: Build agent runtime image
        run: docker build -f docker/Dockerfile.agent-runtime -t carbonkit-agent:test .
      - name: Verify containers start
        run: |
          docker run -d --name mcp-test \
            -e CARBONKIT_DB_BACKEND=sqlite \
            -e CARBONKIT_MCP_TRANSPORT=http \
            carbonkit-mcp:test
          sleep 5
          docker exec mcp-test curl -f http://localhost:8401/health
          docker stop mcp-test
```

### Pipeline Stages

```
push / pull_request
  |
  v
[validate] -- plugin manifests + MCP selftest
  |
  +--> [test:store-adapter] -- DB CRUD, migration, audit
  |
  +--> [test:calc-mcp] -- Ingest, compute, FX, DQS, export
  |
  +--> [test:exec-mcp] -- Pipeline, PDF, OCR, provenance
  |
  +--> [test:strategy-mcp] -- Assessment lifecycle, risk scan
  |
  +--> [test:scope12-mcp] -- Scope 1/2 calculations
  |
  +--> [test:swarm-mcp] -- DAG, merge, gates
  |
  +--> [test:connectors-mcp] -- Schema mapping, crosswalk
  |
  +--> [docker-build] -- Build + verify containers
```

### Test Runner

Tests use a minimal custom runner (no external test framework dependency):

```javascript
// Test helper pattern used across all test files
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}
```

This keeps the test suite zero-dependency, matching the project's philosophy.

---

## Running Tests Locally

```bash
# All smoke tests
node plugins/test-mcp-servers.js

# Individual server tests
node plugins/shared-services/tools/__tests__/store-adapter.test.js
node plugins/scope3-calculation/tools/__tests__/calc-mcp.test.js
node plugins/scope3-execution/tools/__tests__/exec-mcp.test.js
node plugins/scope3-strategy/tools/__tests__/strategy-mcp.test.js
node plugins/scope12-accounting/tools/__tests__/scope12-mcp.test.js
node plugins/swarms/tools/__tests__/swarm-mcp.test.js
node plugins/connectors/tools/__tests__/connectors-mcp.test.js

# Via Make
make test
```
