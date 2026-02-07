#!/usr/bin/env node
'use strict';

// Generate demo data for Q1, Q2, Q3 2024
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateId() {
  return crypto.randomUUID();
}

// Demo vendors and categories for realistic spend
const demoVendors = [
  { name: 'Acme Industrial Supplies', category: '331110', items: ['Steel reinforcement bars', 'Metal components', 'Steel pipes'] },
  { name: 'GreenTech Solutions', category: '334413', items: ['Solar panel modules', 'Power inverters', 'Energy storage units'] },
  { name: 'Pacific Logistics Co', category: '484121', items: ['Freight shipping services', 'Container transport', 'Warehousing'] },
  { name: 'CloudScale Inc', category: '518210', items: ['AWS hosting services', 'Cloud storage', 'Data processing'] },
  { name: 'Mueller GmbH', category: '332710', items: ['Precision machined components', 'Custom parts', 'Assembly services'] },
  { name: 'Tokyo Electronics Ltd', category: '334413', items: ['Semiconductor chips', 'Circuit boards', 'Electronic components'] },
  { name: 'CleanPro Services', category: '561720', items: ['Office cleaning contract', 'Janitorial services', 'Facility maintenance'] },
  { name: 'BritPaper Ltd', category: '322121', items: ['A4 office paper', 'Cardboard packaging', 'Paper products'] },
  { name: 'Delta Air Lines', category: '481111', items: ['Business travel flights', 'Employee travel', 'Conference travel'] },
  { name: 'Marriott International', category: '721110', items: ['Hotel accommodations', 'Conference rooms', 'Team retreats'] },
  { name: 'Waste Management Inc', category: '562111', items: ['Commercial waste disposal', 'Recycling services', 'Hazardous waste'] },
  { name: 'Rajesh Chemicals Pvt Ltd', category: '325199', items: ['Industrial solvents', 'Chemical reagents', 'Process chemicals'] },
  { name: 'FedEx Corporation', category: '492110', items: ['Express shipping', 'Package delivery', 'Courier services'] },
  { name: 'Siemens AG', category: '334512', items: ['HVAC control systems', 'Building automation', 'Energy management'] },
  { name: 'Salesforce Inc', category: '511210', items: ['CRM software licenses', 'Cloud platform', 'Integration services'] },
  { name: 'Concrete Solutions Pty', category: '327320', items: ['Ready-mix concrete', 'Concrete supplies', 'Foundation materials'] },
  { name: 'Samsung SDI', category: '335911', items: ['Lithium-ion battery cells', 'Power banks', 'Battery modules'] },
  { name: 'Hertz Rental', category: '532111', items: ['Vehicle rental', 'Car leasing', 'Fleet services'] },
  { name: 'Johnson Controls', category: '334512', items: ['Building automation', 'Climate systems', 'Security systems'] },
  { name: '3M Company', category: '339113', items: ['Safety equipment PPE', 'Protective gear', 'Safety supplies'] },
  { name: 'Schneider Electric', category: '335313', items: ['Power distribution units', 'Switchgear', 'Electrical equipment'] },
  { name: 'Caterpillar Inc', category: '532412', items: ['Generator rental', 'Heavy equipment', 'Machinery rental'] },
  { name: 'BASF SE', category: '325510', items: ['Industrial coatings', 'Paints', 'Surface treatments'] },
  { name: 'Dow Chemical', category: '325211', items: ['Polyethylene pellets', 'Plastic resins', 'Chemical materials'] },
  { name: 'Intel Corporation', category: '334413', items: ['Server processors', 'Computing chips', 'Hardware components'] },
  { name: 'United Parcel Service', category: '492110', items: ['Ground shipping', 'Package delivery', 'Logistics services'] },
  { name: 'Hilton Hotels', category: '721110', items: ['Employee training retreat', 'Team events', 'Corporate lodging'] },
  { name: 'DHL International', category: '484121', items: ['International freight', 'Global shipping', 'Cross-border logistics'] },
  { name: 'Tata Steel Ltd', category: '331110', items: ['Hot-rolled steel coils', 'Steel products', 'Metal materials'] },
  { name: 'Mitsubishi Electric', category: '335314', items: ['Variable frequency drives', 'Motor controls', 'Industrial automation'] },
  { name: 'Shell Energy', category: '221210', items: ['Natural gas supply', 'Energy services', 'Utility services'] },
  { name: 'Deloitte Consulting', category: '541611', items: ['ESG advisory services', 'Management consulting', 'Strategy consulting'] },
  { name: 'PwC Advisory', category: '541211', items: ['Audit preparation', 'Financial advisory', 'Compliance services'] },
  { name: 'EY Climate Change', category: '541620', items: ['Carbon accounting review', 'Sustainability advisory', 'Climate strategy'] },
  { name: 'Microsoft Corp', category: '518210', items: ['Azure cloud services', 'Office 365', 'Cloud infrastructure'] },
  { name: 'SAP SE', category: '511210', items: ['ERP license renewal', 'Business software', 'Enterprise applications'] },
  { name: 'Oracle Corporation', category: '511210', items: ['Database licenses', 'Cloud applications', 'Enterprise software'] },
  { name: 'Amazon Web Services', category: '518210', items: ['S3 storage', 'EC2 compute', 'Cloud services'] },
  { name: 'Veolia Environment', category: '221310', items: ['Water treatment services', 'Environmental services', 'Utility management'] },
  { name: 'Air Products', category: '325120', items: ['Industrial gases', 'Oxygen supply', 'Nitrogen services'] }
];

const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CHF'];

function generateQuarterData(quarter, year, rowCount = 50) {
  const jobId = generateId();
  const startMonth = (quarter - 1) * 3 + 1;
  const rows = [];

  for (let i = 0; i < rowCount; i++) {
    const vendor = demoVendors[i % demoVendors.length];
    const item = vendor.items[Math.floor(Math.random() * vendor.items.length)];
    const month = startMonth + Math.floor(Math.random() * 3);
    const day = 1 + Math.floor(Math.random() * 28);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Vary spend amounts by category
    let baseSpend = 5000 + Math.random() * 50000;
    if (vendor.category.startsWith('54')) baseSpend *= 2; // Consulting is expensive
    if (vendor.category.startsWith('51')) baseSpend *= 1.5; // Software too
    if (vendor.category.startsWith('33')) baseSpend *= 0.8; // Manufacturing

    const currency = currencies[Math.floor(Math.random() * currencies.length)];
    const hasQuantity = Math.random() > 0.3; // 70% have quantity
    const quantity = hasQuantity ? Math.floor(10 + Math.random() * 1000) : null;
    const unit = hasQuantity ? ['kg', 'units', 'hours', 'liters', 'm3', 'kWh'][Math.floor(Math.random() * 6)] : null;

    rows.push({
      _id: generateId(),
      job_id: jobId,
      row_index: i,
      vendor: vendor.name,
      item_description: item,
      gl_code: null,
      category: vendor.category,
      spend_original: Math.round(baseSpend * 100) / 100,
      currency_original: currency,
      quantity: quantity,
      unit: unit,
      primary_data: null,
      data_quality_flags: hasQuantity ? [] : ['MISSING_QUANTITY', 'MISSING_UNIT'],
      _created_at: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00.000Z`,
      _updated_at: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00.000Z`
    });
  }

  // Calculate reconciliation
  const missingQuantity = rows.filter(r => r.data_quality_flags.includes('MISSING_QUANTITY')).length;
  const totalSpend = rows.reduce((sum, r) => sum + r.spend_original, 0);
  const currencySet = new Set(rows.map(r => r.currency_original));
  const unitSet = new Set(rows.map(r => r.unit).filter(u => u));

  const job = {
    _id: jobId,
    filename: `Q${quarter}-${year}-spend-data.csv`,
    status: 'DONE',
    row_count: rowCount,
    reporting_currency: 'USD',
    reconciliation: {
      missing: {
        MISSING_VENDOR: 0,
        MISSING_DESCRIPTION: 0,
        MISSING_SPEND: 0,
        MISSING_CURRENCY: 0,
        MISSING_QUANTITY: missingQuantity,
        MISSING_UNIT: missingQuantity
      },
      missing_pct: {
        MISSING_VENDOR: 0,
        MISSING_DESCRIPTION: 0,
        MISSING_SPEND: 0,
        MISSING_CURRENCY: 0,
        MISSING_QUANTITY: missingQuantity / rowCount,
        MISSING_UNIT: missingQuantity / rowCount
      },
      currencies: Array.from(currencySet),
      units: Array.from(unitSet),
      distinct_counts: {
        vendors: new Set(rows.map(r => r.vendor)).size,
        items: new Set(rows.map(r => r.item_description)).size
      },
      flags: {
        MISSING_VENDOR: 0,
        MISSING_DESCRIPTION: 0,
        MISSING_SPEND: 0,
        MISSING_CURRENCY: 0,
        MISSING_QUANTITY: missingQuantity,
        MISSING_UNIT: missingQuantity
      },
      rows_with_any_flag: missingQuantity,
      rows_clean: rowCount - missingQuantity,
      spend_total: totalSpend,
      quantity_total: rows.reduce((sum, r) => sum + (r.quantity || 0), 0)
    },
    created_at: `${year}-${String(startMonth + 2).padStart(2, '0')}-28T12:00:00.000Z`,
    updated_at: `${year}-${String(startMonth + 2).padStart(2, '0')}-28T12:00:00.000Z`,
    _created_at: `${year}-${String(startMonth + 2).padStart(2, '0')}-28T12:00:00.000Z`,
    _updated_at: `${year}-${String(startMonth + 2).padStart(2, '0')}-28T12:00:00.000Z`
  };

  return { job, rows };
}

// Generate Q1, Q2, Q3 2024 data
const q1 = generateQuarterData(1, 2024, 50);
const q2 = generateQuarterData(2, 2024, 50);
const q3 = generateQuarterData(3, 2024, 50);

// Read existing data
const jobsPath = path.join(__dirname, 'jobs.json');
const rowsPath = path.join(__dirname, 'activity_rows.json');

let existingJobs = [];
let existingRows = [];

try {
  existingJobs = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
} catch (e) {
  existingJobs = [];
}

try {
  existingRows = JSON.parse(fs.readFileSync(rowsPath, 'utf8'));
} catch (e) {
  existingRows = [];
}

// Filter out old demo data and append new
const newJobs = [q1.job, q2.job, q3.job];
const newRows = [...q1.rows, ...q2.rows, ...q3.rows];

// Write updated data
fs.writeFileSync(jobsPath, JSON.stringify(newJobs, null, 2));
fs.writeFileSync(rowsPath, JSON.stringify(newRows, null, 2));

console.log('Demo data generated successfully!');
console.log(`Q1 2024: ${q1.rows.length} rows, Job ID: ${q1.job._id}`);
console.log(`Q2 2024: ${q2.rows.length} rows, Job ID: ${q2.job._id}`);
console.log(`Q3 2024: ${q3.rows.length} rows, Job ID: ${q3.job._id}`);
console.log(`Total: 150 rows across 3 quarters`);
