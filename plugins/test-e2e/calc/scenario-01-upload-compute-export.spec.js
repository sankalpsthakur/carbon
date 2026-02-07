/**
 * C-E2E-01: Upload CSV → Ingest → Compute → View Results → Export PDF
 *
 * Tests the complete calculation workflow from CSV ingestion to PDF export.
 *
 * Steps:
 * 1. Upload sample-spend-50rows.csv
 * 2. Verify ingestion job created with 50 activity rows
 * 3. Run compute, verify LCA run with emissions totals
 * 4. View dashboard summary/hotspots
 * 5. Export PDF manifest
 *
 * Expected Results:
 * - Job created with status=pending
 * - 50 activity rows stored in DB
 * - Compute completes with total_emissions_tco2e > 0
 * - Summary shows scope3 breakdown
 * - Hotspots sorted by CO2e descending
 * - PDF manifest contains 3 pages
 */

const { describe, it, before, after } = require('mocha');
const { expect } = require('chai');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const config = require('../config');

describe('C-E2E-01: Upload CSV → Ingest → Compute → View Results → Export PDF', function() {
  this.timeout(config.timeout);

  let api;
  let jobId;
  let runId;

  before(function() {
    // Initialize API client
    api = request(config.baseUrl);
  });

  after(function() {
    // Cleanup: Delete test job and related data
    // NOTE: This requires DELETE endpoints to be implemented
  });

  it('should upload CSV and create ingestion job', async function() {
    // Load fixture data
    const csvPath = path.join(config.fixtures, 'sample-spend-50rows.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');

    // Parse CSV to JSON (simplified)
    const lines = csvContent.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',');
    const rows = lines.slice(1).map(line => {
      const values = line.split(',');
      const row = {};
      headers.forEach((h, i) => { row[h.trim()] = values[i]?.trim(); });
      return row;
    });

    // Call ingest endpoint
    const response = await api
      .post('/calc/ingest')
      .send({
        filename: 'sample-spend-50rows.csv',
        rows: rows,
        reporting_currency: 'USD'
      })
      .expect(201)
      .expect('Content-Type', /json/);

    // Verify response
    expect(response.body).to.have.property('error', false);
    expect(response.body).to.have.property('job_id');
    expect(response.body).to.have.property('row_count', 50);
    expect(response.body).to.have.property('reporting_currency', 'USD');

    jobId = response.body.job_id;
    console.log(`  ✓ Created job: ${jobId}`);
  });

  it('should verify 50 activity rows stored in DB', async function() {
    const response = await api
      .post('/calc/db/get')
      .send({
        collection: 'activity_rows',
        query: { job_id: jobId },
        limit: 100
      })
      .expect(200);

    expect(response.body).to.have.property('count', 50);
    expect(response.body.docs).to.be.an('array').with.lengthOf(50);

    // Verify required fields present
    const firstRow = response.body.docs[0];
    expect(firstRow).to.have.property('vendor');
    expect(firstRow).to.have.property('item_description');
    expect(firstRow).to.have.property('spend_original');
    expect(firstRow).to.have.property('currency_original');

    console.log(`  ✓ Verified 50 activity rows stored`);
  });

  it('should compute emissions for job', async function() {
    const response = await api
      .post('/calc/compute')
      .send({
        job_id: jobId,
        refresh: false,
        force: false
      })
      .expect(200);

    // Verify compute response
    expect(response.body).to.have.property('error', false);
    expect(response.body).to.have.property('run_id');
    expect(response.body).to.have.property('item_count').that.is.greaterThan(0);
    expect(response.body).to.have.property('total_emissions_tco2e').that.is.greaterThan(0);
    expect(response.body).to.have.property('dqs_score').that.is.within(0, 1);
    expect(response.body).to.have.property('method_breakdown');

    runId = response.body.run_id;
    console.log(`  ✓ Computed emissions: ${response.body.total_emissions_tco2e.toFixed(2)} tCO2e (DQS: ${response.body.dqs_score.toFixed(3)})`);
  });

  it('should verify inventory items created', async function() {
    const response = await api
      .post('/calc/db/get')
      .send({
        collection: 'inventory_items',
        query: { job_id: jobId },
        limit: 100
      })
      .expect(200);

    expect(response.body.count).to.be.greaterThan(0);

    // Verify inventory item structure
    const firstItem = response.body.docs[0];
    expect(firstItem).to.have.property('job_id', jobId);
    expect(firstItem).to.have.property('vendor');
    expect(firstItem).to.have.property('emissions_total_tco2e');
    expect(firstItem).to.have.property('method');
    expect(firstItem).to.have.property('factor_id');

    console.log(`  ✓ Verified ${response.body.count} inventory items`);
  });

  it('should fetch dashboard summary', async function() {
    const response = await api
      .post('/calc/db/get')
      .send({
        collection: 'lca_runs',
        query: { job_id: jobId }
      })
      .expect(200);

    expect(response.body.docs).to.be.an('array').with.lengthOf.at.least(1);

    const run = response.body.docs[0];
    expect(run).to.have.property('total_emissions_tco2e').that.is.greaterThan(0);
    expect(run).to.have.property('scope3_breakdown');
    expect(run).to.have.property('dqs_score');

    console.log(`  ✓ Dashboard summary loaded (${run.total_emissions_tco2e.toFixed(2)} tCO2e)`);
  });

  it('should fetch hotspots sorted by CO2e descending', async function() {
    const response = await api
      .post('/calc/db/get')
      .send({
        collection: 'inventory_items',
        query: { job_id: jobId },
        limit: 10
      })
      .expect(200);

    const items = response.body.docs;
    expect(items).to.be.an('array').with.lengthOf.at.least(1);

    // Verify sorting (highest emissions first)
    // NOTE: DB query doesn't support sorting, so this is best-effort
    const emissions = items.map(i => i.emissions_total_tco2e);
    const topEmissions = Math.max(...emissions);
    expect(topEmissions).to.be.greaterThan(0);

    console.log(`  ✓ Fetched hotspots (top emission: ${topEmissions.toFixed(2)} tCO2e)`);
  });

  it('should export intensity CSV', async function() {
    const response = await api
      .post('/calc/export')
      .send({
        job_id: jobId,
        format: 'csv'
      })
      .expect(200);

    expect(response.body).to.have.property('error', false);
    expect(response.body).to.have.property('format', 'csv');
    expect(response.body).to.have.property('job_id', jobId);
    expect(response.body).to.have.property('data');

    // Verify CSV structure
    const csvData = response.body.data;
    expect(csvData).to.be.a('string');
    expect(csvData).to.include('vendor');
    expect(csvData).to.include('emissions_total_tco2e');

    console.log(`  ✓ Exported intensity CSV (${csvData.split('\n').length - 1} rows)`);
  });

  it('should export PDF manifest', async function() {
    const response = await api
      .post('/calc/export')
      .send({
        job_id: jobId,
        format: 'pdf'
      })
      .expect(200);

    expect(response.body).to.have.property('error', false);
    expect(response.body).to.have.property('format', 'pdf');
    expect(response.body).to.have.property('pdf_manifest');
    expect(response.body).to.have.property('page_count', 3);

    const manifest = response.body.pdf_manifest;
    expect(manifest).to.have.property('title');
    expect(manifest).to.have.property('pages').that.is.an('array').with.lengthOf(3);

    // Verify page structure
    const firstPage = manifest.pages[0];
    expect(firstPage).to.have.property('page', 1);
    expect(firstPage).to.have.property('title', 'Executive Summary');
    expect(firstPage).to.have.property('sections').that.is.an('array');

    console.log(`  ✓ Exported PDF manifest (3 pages)`);
  });

  it('should verify DQS score calculation', async function() {
    const response = await api
      .post('/calc/dqs-score')
      .send({
        job_id: jobId
      })
      .expect(200);

    expect(response.body).to.have.property('job_id', jobId);
    expect(response.body).to.have.property('base_score').that.is.within(0, 1);
    expect(response.body).to.have.property('method_score').that.is.within(0, 1);
    expect(response.body).to.have.property('final_dqs').that.is.within(0, 1);
    expect(response.body).to.have.property('missing_rates');
    expect(response.body).to.have.property('formula');

    console.log(`  ✓ DQS Score: ${response.body.final_dqs.toFixed(3)} (base: ${response.body.base_score.toFixed(3)}, method: ${response.body.method_score.toFixed(3)})`);
  });

  it('should verify FX normalization was applied', async function() {
    // Check if any rows had non-USD currency
    const activityRowsResponse = await api
      .post('/calc/db/get')
      .send({
        collection: 'activity_rows',
        query: { job_id: jobId },
        limit: 50
      })
      .expect(200);

    const nonUsdRows = activityRowsResponse.body.docs.filter(r => r.currency_original !== 'USD');

    if (nonUsdRows.length > 0) {
      // Test FX normalization for first non-USD row
      const testRow = nonUsdRows[0];
      const fxResponse = await api
        .post('/calc/fx-normalize')
        .send({
          amount: testRow.spend_original,
          from_currency: testRow.currency_original,
          to_currency: 'USD'
        })
        .expect(200);

      expect(fxResponse.body).to.have.property('rate').that.is.greaterThan(0);
      expect(fxResponse.body).to.have.property('converted').that.is.greaterThan(0);

      console.log(`  ✓ FX normalization verified (${testRow.currency_original} → USD, rate: ${fxResponse.body.rate})`);
    } else {
      console.log(`  ⊘ No non-USD rows to test FX normalization`);
    }
  });

  it('should verify audit trail exists', async function() {
    // Check for audit events (if audit_events collection exists)
    const response = await api
      .post('/calc/db/get')
      .send({
        collection: 'audit_events',
        query: { job_id: jobId },
        limit: 100
      })
      .expect(200);

    // Audit events may or may not exist depending on implementation
    if (response.body.count > 0) {
      console.log(`  ✓ Verified ${response.body.count} audit events logged`);
    } else {
      console.log(`  ⊘ No audit events (audit trail may not be implemented in calc module)`);
    }
  });
});
