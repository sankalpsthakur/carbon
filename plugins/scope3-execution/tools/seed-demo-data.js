#!/usr/bin/env node
'use strict';

/**
 * Demo Data Seeder for scope3-execution
 *
 * Seeds realistic supplier, engagement, and document data for testing.
 */

const path = require('path');
const { createStore } = require('../../shared-services/tools/store-adapter');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const store = createStore({ dataDir: DATA_DIR, serverName: 'seed-demo-data' });

// ---------------------------------------------------------------------------
// Demo Suppliers
// ---------------------------------------------------------------------------

const DEMO_SUPPLIERS = [
  {
    _id: 'sup-acme-logistics',
    name: 'Acme Logistics',
    category: 'logistics',
    cee_rating: 'B',
    upstream_impact_pct: 12.5,
    evidence_status: 'ok',
    country: 'USA',
    annual_spend_usd: 2500000,
  },
  {
    _id: 'sup-global-steel',
    name: 'Global Steel Manufacturing',
    category: 'manufacturing',
    cee_rating: 'D',
    upstream_impact_pct: 28.3,
    evidence_status: 'insufficient_context',
    country: 'China',
    annual_spend_usd: 8900000,
  },
  {
    _id: 'sup-greenpower-energy',
    name: 'GreenPower Energy',
    category: 'energy',
    cee_rating: 'A',
    upstream_impact_pct: 5.2,
    evidence_status: 'ok',
    country: 'Norway',
    annual_spend_usd: 4200000,
  },
  {
    _id: 'sup-techcorp-cloud',
    name: 'TechCorp Cloud Services',
    category: 'technology',
    cee_rating: 'B',
    upstream_impact_pct: 8.7,
    evidence_status: 'ok',
    country: 'USA',
    annual_spend_usd: 3100000,
  },
  {
    _id: 'sup-plastics-inc',
    name: 'Plastics Inc',
    category: 'manufacturing',
    cee_rating: 'E',
    upstream_impact_pct: 32.1,
    evidence_status: 'missing_public_report',
    country: 'India',
    annual_spend_usd: 1800000,
  },
  {
    _id: 'sup-clean-shipping',
    name: 'Clean Shipping Lines',
    category: 'logistics',
    cee_rating: 'C',
    upstream_impact_pct: 15.8,
    evidence_status: 'ok',
    country: 'Singapore',
    annual_spend_usd: 5400000,
  },
  {
    _id: 'sup-solar-components',
    name: 'Solar Components Ltd',
    category: 'manufacturing',
    cee_rating: 'A',
    upstream_impact_pct: 4.1,
    evidence_status: 'ok',
    country: 'Germany',
    annual_spend_usd: 2900000,
  },
  {
    _id: 'sup-pacific-freight',
    name: 'Pacific Freight Co',
    category: 'logistics',
    cee_rating: 'C',
    upstream_impact_pct: 18.2,
    evidence_status: 'insufficient_context',
    country: 'Australia',
    annual_spend_usd: 3700000,
  },
  {
    _id: 'sup-data-centers',
    name: 'Global Data Centers',
    category: 'technology',
    cee_rating: 'B',
    upstream_impact_pct: 11.4,
    evidence_status: 'ok',
    country: 'Ireland',
    annual_spend_usd: 6200000,
  },
  {
    _id: 'sup-cement-works',
    name: 'Cement Works Co',
    category: 'construction',
    cee_rating: 'D',
    upstream_impact_pct: 24.9,
    evidence_status: 'insufficient_context',
    country: 'Mexico',
    annual_spend_usd: 4800000,
  },
  {
    _id: 'sup-eco-packaging',
    name: 'Eco Packaging Solutions',
    category: 'manufacturing',
    cee_rating: 'A',
    upstream_impact_pct: 3.6,
    evidence_status: 'ok',
    country: 'Sweden',
    annual_spend_usd: 1500000,
  },
  {
    _id: 'sup-fossil-energy',
    name: 'Fossil Energy Corp',
    category: 'energy',
    cee_rating: 'E',
    upstream_impact_pct: 38.7,
    evidence_status: 'missing_public_report',
    country: 'Saudi Arabia',
    annual_spend_usd: 12000000,
  },
  {
    _id: 'sup-rail-transport',
    name: 'Rail Transport Network',
    category: 'logistics',
    cee_rating: 'B',
    upstream_impact_pct: 9.3,
    evidence_status: 'ok',
    country: 'Switzerland',
    annual_spend_usd: 2800000,
  },
  {
    _id: 'sup-chemical-supply',
    name: 'Chemical Supply Inc',
    category: 'manufacturing',
    cee_rating: 'D',
    upstream_impact_pct: 26.5,
    evidence_status: 'insufficient_context',
    country: 'USA',
    annual_spend_usd: 5600000,
  },
  {
    _id: 'sup-wind-turbines',
    name: 'Wind Turbine Systems',
    category: 'energy',
    cee_rating: 'A',
    upstream_impact_pct: 4.8,
    evidence_status: 'ok',
    country: 'Denmark',
    annual_spend_usd: 7200000,
  },
  {
    _id: 'sup-fleet-management',
    name: 'Fleet Management Pro',
    category: 'logistics',
    cee_rating: 'C',
    upstream_impact_pct: 14.2,
    evidence_status: 'ok',
    country: 'UK',
    annual_spend_usd: 3400000,
  },
  {
    _id: 'sup-textile-mills',
    name: 'Textile Mills Group',
    category: 'manufacturing',
    cee_rating: 'D',
    upstream_impact_pct: 22.7,
    evidence_status: 'insufficient_context',
    country: 'Bangladesh',
    annual_spend_usd: 4100000,
  },
  {
    _id: 'sup-cloud-ai',
    name: 'Cloud AI Services',
    category: 'technology',
    cee_rating: 'B',
    upstream_impact_pct: 10.1,
    evidence_status: 'ok',
    country: 'USA',
    annual_spend_usd: 8500000,
  },
  {
    _id: 'sup-hydro-power',
    name: 'Hydro Power Systems',
    category: 'energy',
    cee_rating: 'A',
    upstream_impact_pct: 3.2,
    evidence_status: 'ok',
    country: 'Canada',
    annual_spend_usd: 5900000,
  },
  {
    _id: 'sup-aluminum-smelter',
    name: 'Aluminum Smelting Co',
    category: 'manufacturing',
    cee_rating: 'E',
    upstream_impact_pct: 35.4,
    evidence_status: 'missing_public_report',
    country: 'Russia',
    annual_spend_usd: 9800000,
  },
];

// ---------------------------------------------------------------------------
// Demo Engagements
// ---------------------------------------------------------------------------

const DEMO_ENGAGEMENTS = [
  {
    _id: 'eng-acme-logistics',
    supplier_id: 'sup-acme-logistics',
    status: 'completed',
    started_at: '2025-10-01T00:00:00Z',
    completed_at: '2025-12-15T00:00:00Z',
  },
  {
    _id: 'eng-global-steel',
    supplier_id: 'sup-global-steel',
    status: 'in_progress',
    started_at: '2025-11-15T00:00:00Z',
  },
  {
    _id: 'eng-greenpower-energy',
    supplier_id: 'sup-greenpower-energy',
    status: 'completed',
    started_at: '2025-09-01T00:00:00Z',
    completed_at: '2025-11-30T00:00:00Z',
  },
  {
    _id: 'eng-techcorp-cloud',
    supplier_id: 'sup-techcorp-cloud',
    status: 'pending_response',
    started_at: '2025-12-01T00:00:00Z',
  },
  {
    _id: 'eng-plastics-inc',
    supplier_id: 'sup-plastics-inc',
    status: 'not_started',
  },
  {
    _id: 'eng-clean-shipping',
    supplier_id: 'sup-clean-shipping',
    status: 'in_progress',
    started_at: '2025-11-20T00:00:00Z',
  },
  {
    _id: 'eng-solar-components',
    supplier_id: 'sup-solar-components',
    status: 'completed',
    started_at: '2025-08-15T00:00:00Z',
    completed_at: '2025-10-31T00:00:00Z',
  },
  {
    _id: 'eng-pacific-freight',
    supplier_id: 'sup-pacific-freight',
    status: 'in_progress',
    started_at: '2025-12-10T00:00:00Z',
  },
  {
    _id: 'eng-data-centers',
    supplier_id: 'sup-data-centers',
    status: 'pending_response',
    started_at: '2025-11-25T00:00:00Z',
  },
  {
    _id: 'eng-cement-works',
    supplier_id: 'sup-cement-works',
    status: 'not_started',
  },
  {
    _id: 'eng-eco-packaging',
    supplier_id: 'sup-eco-packaging',
    status: 'completed',
    started_at: '2025-09-10T00:00:00Z',
    completed_at: '2025-11-20T00:00:00Z',
  },
  {
    _id: 'eng-rail-transport',
    supplier_id: 'sup-rail-transport',
    status: 'in_progress',
    started_at: '2025-12-05T00:00:00Z',
  },
  {
    _id: 'eng-wind-turbines',
    supplier_id: 'sup-wind-turbines',
    status: 'completed',
    started_at: '2025-10-15T00:00:00Z',
    completed_at: '2025-12-20T00:00:00Z',
  },
  {
    _id: 'eng-fleet-management',
    supplier_id: 'sup-fleet-management',
    status: 'pending_response',
    started_at: '2025-12-01T00:00:00Z',
  },
  {
    _id: 'eng-cloud-ai',
    supplier_id: 'sup-cloud-ai',
    status: 'on_hold',
    started_at: '2025-11-01T00:00:00Z',
    hold_reason: 'Awaiting legal review',
  },
];

// ---------------------------------------------------------------------------
// Demo Documents (metadata only - no actual PDFs)
// ---------------------------------------------------------------------------

const DEMO_DOCUMENTS = [
  {
    _id: 'doc-acme-sustainability-2025',
    filename: 'acme-logistics-sustainability-report-2025.pdf',
    title: 'Acme Logistics Sustainability Report 2025',
    company_id: 'sup-acme-logistics',
    category: 'sustainability_report',
    mime_type: 'application/pdf',
    ingested: true,
    page_count: 42,
  },
  {
    _id: 'doc-greenpower-cdp-2025',
    filename: 'greenpower-cdp-climate-response-2025.pdf',
    title: 'GreenPower CDP Climate Response 2025',
    company_id: 'sup-greenpower-energy',
    category: 'cdp_response',
    mime_type: 'application/pdf',
    ingested: true,
    page_count: 28,
  },
  {
    _id: 'doc-solar-esg-report',
    filename: 'solar-components-esg-report-2024.pdf',
    title: 'Solar Components ESG Report 2024',
    company_id: 'sup-solar-components',
    category: 'esg_report',
    mime_type: 'application/pdf',
    ingested: true,
    page_count: 35,
  },
  {
    _id: 'doc-wind-turbines-ghg',
    filename: 'wind-turbine-systems-ghg-inventory-2024.pdf',
    title: 'Wind Turbine Systems GHG Inventory 2024',
    company_id: 'sup-wind-turbines',
    category: 'ghg_inventory',
    mime_type: 'application/pdf',
    ingested: true,
    page_count: 18,
  },
  {
    _id: 'doc-data-centers-energy',
    filename: 'global-data-centers-energy-report-2025.pdf',
    title: 'Global Data Centers Energy Efficiency Report 2025',
    company_id: 'sup-data-centers',
    category: 'sustainability_report',
    mime_type: 'application/pdf',
    ingested: false,
    page_count: 52,
  },
];

// ---------------------------------------------------------------------------
// Seed Function
// ---------------------------------------------------------------------------

function seedDemoData() {
  console.log('Seeding demo data for scope3-execution...');

  // Clear existing test data (keep any production data)
  const existingSuppliers = store.list('suppliers');
  for (const sup of existingSuppliers) {
    if (sup._id.startsWith('sup-test') || sup._id.startsWith('sup-')) {
      store.delete('suppliers', { _id: sup._id });
    }
  }

  const existingEngagements = store.list('engagements');
  for (const eng of existingEngagements) {
    if (eng._id.startsWith('eng-')) {
      store.delete('engagements', { _id: eng._id });
    }
  }

  const existingDocs = store.list('documents');
  for (const doc of existingDocs) {
    if (doc._id.startsWith('doc-')) {
      store.delete('documents', { _id: doc._id });
    }
  }

  // Seed suppliers
  console.log(`Seeding ${DEMO_SUPPLIERS.length} suppliers...`);
  for (const supplier of DEMO_SUPPLIERS) {
    store.set('suppliers', supplier);
  }

  // Seed engagements
  console.log(`Seeding ${DEMO_ENGAGEMENTS.length} engagements...`);
  for (const engagement of DEMO_ENGAGEMENTS) {
    store.set('engagements', engagement);
  }

  // Seed documents
  console.log(`Seeding ${DEMO_DOCUMENTS.length} documents...`);
  for (const doc of DEMO_DOCUMENTS) {
    store.set('documents', doc);
  }

  // Summary
  const supplierCount = store.list('suppliers').length;
  const engagementCount = store.list('engagements').length;
  const docCount = store.list('documents').length;

  console.log('\nDemo data seeding complete!');
  console.log(`  Suppliers: ${supplierCount}`);
  console.log(`  Engagements: ${engagementCount}`);
  console.log(`  Documents: ${docCount}`);

  // Category breakdown
  const categories = {};
  for (const sup of store.list('suppliers')) {
    const cat = sup.category || 'unknown';
    categories[cat] = (categories[cat] || 0) + 1;
  }
  console.log('\nSupplier categories:');
  for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  // Rating breakdown
  const ratings = {};
  for (const sup of store.list('suppliers')) {
    const rating = sup.cee_rating || 'unrated';
    ratings[rating] = (ratings[rating] || 0) + 1;
  }
  console.log('\nSupplier CEE ratings:');
  for (const [rating, count] of Object.entries(ratings).sort()) {
    console.log(`  ${rating}: ${count}`);
  }

  // Engagement status breakdown
  const statuses = {};
  for (const eng of store.list('engagements')) {
    const status = eng.status || 'unknown';
    statuses[status] = (statuses[status] || 0) + 1;
  }
  console.log('\nEngagement statuses:');
  for (const [status, count] of Object.entries(statuses).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status}: ${count}`);
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (require.main === module) {
  try {
    seedDemoData();
    process.exit(0);
  } catch (err) {
    console.error('Error seeding demo data:', err);
    process.exit(1);
  }
}

module.exports = { seedDemoData, DEMO_SUPPLIERS, DEMO_ENGAGEMENTS, DEMO_DOCUMENTS };
