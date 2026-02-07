# CarbonKit E2E Test Suite

End-to-end integration tests for CarbonKit MCP servers.

## Prerequisites

**BLOCKED**: Awaiting HTTP transport implementation from SWARM 1 (infra-specialist)

Once HTTP transport is ready:
- Node.js 18+ required
- Install dependencies: `npm install`
- Start MCP servers on localhost:3000

## Test Structure

```
test-e2e/
├── calc/           # Calculation module tests (4 scenarios)
├── exec/           # Execution module tests (4 scenarios)
├── strategy/       # Strategy module tests (2 scenarios)
├── cross-module/   # Cross-module integration (2 scenarios)
├── fixtures/       # Test data fixtures
├── helpers/        # Test utilities
└── config.js       # Test configuration
```

## Test Scenarios (12 Total)

### Calculation Module (4 scenarios)

**C-E2E-01: Upload CSV → Ingest → Compute → View Results → Export PDF**
- Upload sample-spend-50rows.csv
- Verify ingestion job created with 50 activity rows
- Run compute, verify LCA run with emissions totals
- View dashboard summary/hotspots
- Export PDF manifest

**C-E2E-02: View Dashboard → Filter Hotspots → Export Intensity CSV**
- Load job with computed emissions
- Fetch hotspots sorted by CO2e descending
- Filter by vendor/category
- Export intensity CSV, verify format

**C-E2E-03: Override Emission Factor → Replay Compute → Verify Change**
- Select inventory item
- Override emission factor with custom value
- Replay compute (force=true)
- Verify emissions changed and audit trail logged

**C-E2E-04: Lock Period → Attempt Edit → Verify Rejection**
- Lock ingestion job period
- Attempt to edit activity row
- Verify 409 Conflict response
- Verify lock status in job metadata

### Execution Module (4 scenarios)

**E-E2E-01: Upload PDF → Render Pages → OCR → Save Provenance → Verify Evidence Chain**
- Upload PDF document (metadata only, no blob)
- Attempt render page 1 (expect stub/poppler message)
- Attempt OCR (expect stub/tesseract message)
- Save provenance link (supplier → doc → page)
- Verify evidence chain in DB

**E-E2E-02: Run Pipeline → View Suppliers → Filter by Category → Deep Dive Panel**
- Run full pipeline (all stages)
- Verify suppliers/recommendations generated
- Filter suppliers by category='energy'
- Fetch deep dive data for top supplier
- Verify recommendations linked

**E-E2E-03: Update Engagement Status → Verify Audit Trail → Quality Gates**
- Create engagement for supplier
- Update status: pending → active → completed
- Verify audit events logged for each transition
- Run quality gates, verify no anomalies for complete engagement
- Run quality gates on incomplete engagement, verify anomalies detected

**E-E2E-04: Export CSRD E1-6 → Validate JSON Structure → Verify Completeness**
- Seed measure data (scope1/2/3)
- Run pipeline to generate suppliers/engagements
- Export CSRD E1-6 JSON
- Validate schema compliance (6 sections)
- Verify all required fields present

### Strategy Module (2 scenarios)

**S-E2E-01: Create Assessment → Score 10 IROs → Generate Matrix → Finalize Snapshot → Export Pack**
- Create DMA assessment for org+year
- Create 10 IROs (3 impacts, 4 risks, 3 opportunities)
- Score each IRO with impact+financial materiality (1-5)
- Generate materiality matrix, verify quadrant classification
- Finalize snapshot with SHA-256 hash
- Export evidence pack JSON

**S-E2E-02: External Risk Scan → View Signals → Link to IRO → Verify Evidence**
- Run risk scan (expect 6 hardcoded signals STUB)
- View risk signals
- Create IRO for risk signal
- Attach signal as evidence to IRO
- Verify evidence linked and evidence_count incremented

### Cross-Module Integration (2 scenarios)

**X-E2E-01: Calc Emissions → Exec Recommendations → Strategy Targets (Full Chain)**
- CALC: Upload spend CSV, compute emissions, identify hotspots
- EXEC: Run pipeline, generate supplier recommendations for hotspots
- STRATEGY: Create assessment, create IRO for top emission source, attach calc/exec evidence
- Verify data flows across all 3 modules

**X-E2E-02: Calc Inventory → Exec PDF Evidence → Strategy IRO Evidence (Data Flow)**
- CALC: Create inventory item for supplier spend
- EXEC: Upload PDF evidence for supplier, save provenance linking to calc item
- STRATEGY: Create IRO for supplier risk, attach exec provenance as evidence
- Verify evidence chain: calc_item → exec_provenance → strategy_iro_evidence

## Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run single module
npm run test:e2e:calc
npm run test:e2e:exec
npm run test:e2e:strategy
npm run test:e2e:cross

# Run specific scenario
npm run test:e2e -- --grep "C-E2E-01"

# Run with verbose logging
DEBUG=carbonkit:* npm run test:e2e

# Generate coverage report
npm run test:e2e:coverage
```

## Test Configuration

```javascript
// config.js
module.exports = {
  baseUrl: process.env.BASE_URL || 'http://localhost:3000/api',
  timeout: 30000, // 30s per test
  retries: 2,
  parallel: false, // Sequential for deterministic results
  fixtures: './fixtures',
  screenshots: './screenshots',
  videos: './videos',
};
```

## Expected Outcomes

**Success Criteria**:
- 12/12 scenarios PASS
- 0 failures, 0 timeouts
- Average duration: 45s per scenario
- All data consistency checks pass
- All audit trails verified

**Performance Targets**:
- p50 latency: <120ms
- p95 latency: <380ms
- p99 latency: <520ms
- Max latency: <500ms (excluding stub operations)

## Notes

- **STUB operations** (render_page, ocr, risk_scan) will return friendly messages instead of actual results
- **NOT IMPLEMENTED**: snapshot.verify verification logic (tool exists but no implementation)
- **No blob storage**: PDF uploads store metadata only, no actual file storage
- **Isolated MCP servers**: calc/exec/strategy have separate FileStore implementations, no shared data bridge

## Dependencies

```json
{
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "chai": "^4.3.10",
    "mocha": "^10.2.0",
    "supertest": "^6.3.3"
  }
}
```

## CI/CD Integration

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: test-results
          path: test-results/
```
