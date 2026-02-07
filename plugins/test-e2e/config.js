/**
 * CarbonKit E2E Test Configuration
 *
 * Environment variables:
 * - BASE_URL: Base URL for API endpoints (default: http://localhost:3000/api)
 * - TEST_TIMEOUT: Test timeout in ms (default: 30000)
 * - TEST_RETRIES: Number of retries for flaky tests (default: 2)
 * - DEBUG: Enable debug logging (e.g., DEBUG=carbonkit:*)
 */

const path = require('path');

module.exports = {
  // API configuration
  baseUrl: process.env.BASE_URL || 'http://localhost:3000/api',
  timeout: parseInt(process.env.TEST_TIMEOUT || '30000', 10),
  retries: parseInt(process.env.TEST_RETRIES || '2', 10),

  // Test execution
  parallel: process.env.PARALLEL === 'true', // Sequential by default for deterministic results
  bail: process.env.BAIL === 'true', // Stop on first failure

  // Paths
  fixtures: path.resolve(__dirname, 'fixtures'),
  screenshots: path.resolve(__dirname, 'screenshots'),
  videos: path.resolve(__dirname, 'videos'),
  reports: path.resolve(__dirname, 'reports'),

  // Performance targets
  performance: {
    p50_latency_ms: 120,
    p95_latency_ms: 380,
    p99_latency_ms: 520,
    max_latency_ms: 500,
    throughput_req_per_sec: 150,
  },

  // Database collections (for verification)
  collections: {
    calc: [
      'ingestion_jobs',
      'activity_rows',
      'inventory_items',
      'emission_factors',
      'overrides',
      'fx_rates',
      'lca_runs',
    ],
    exec: [
      'suppliers',
      'recommendations',
      'engagements',
      'documents',
      'document_pages',
      'ocr_blocks',
      'field_provenance',
      'quality_anomalies',
      'audit_events',
      'measure_inputs',
    ],
    strategy: [
      'orgs',
      'products',
      'datasets_lca',
      'datasets_volumes',
      'datasets_scope3',
      'datasets_scope12',
      'biodiversity',
      'dma_assessments',
      'iros',
      'iro_evidence',
      'materiality_matrices',
      'assessment_snapshots',
      'external_risks',
      'external_docs',
      'external_alerts',
      'trends',
      'targets',
    ],
  },

  // Known limitations and stubs
  stubs: {
    render_page: 'Requires poppler-utils (pdftoppm) or wkhtmltoimage',
    ocr: 'Requires tesseract OCR',
    risk_scan: 'Returns 6 hardcoded risk signals',
    snapshot_verify: 'Verification logic not implemented',
  },

  // Test data
  testData: {
    sampleCsvRows: 50,
    sampleSuppliers: 20,
    sampleIros: 10,
    sampleEvidencePerIro: 3,
  },

  // MCP server info
  mcpServers: {
    calc: {
      name: 'scope3-calculation-mcp',
      tools: 11,
      collections: 7,
    },
    exec: {
      name: 'scope3-execution-mcp',
      tools: 21,
      collections: 10,
    },
    strategy: {
      name: 'scope3-strategy-mcp',
      tools: 18,
      collections: 17,
    },
  },
};
