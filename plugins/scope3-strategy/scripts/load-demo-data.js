#!/usr/bin/env node

// Load demo assessment data into the strategy module data directory
// This script merges demo data with any existing data.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DEMO_SEED_PATH = path.join(DATA_DIR, "demo-seed.json");

function loadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function mergeData(existing, newData, idField = "_id") {
  const merged = [...existing];
  const existingIds = new Set(existing.map((item) => item[idField]));

  for (const item of newData) {
    if (!existingIds.has(item[idField])) {
      merged.push(item);
    }
  }

  return merged;
}

function main() {
  console.log("Loading demo seed data...");

  const demoSeed = loadJson(DEMO_SEED_PATH);

  // Load existing data
  const assessmentsPath = path.join(DATA_DIR, "assessments.json");
  const irosPath = path.join(DATA_DIR, "iros.json");
  const evidencePath = path.join(DATA_DIR, "evidence.json");

  const existingAssessments = loadJson(assessmentsPath);
  const existingIros = loadJson(irosPath);
  const existingEvidence = loadJson(evidencePath);

  // Merge data
  const mergedAssessments = mergeData(existingAssessments, demoSeed.assessments);
  const mergedIros = mergeData(existingIros, demoSeed.iros);
  const mergedEvidence = mergeData(existingEvidence, demoSeed.evidence);

  // Save merged data
  saveJson(assessmentsPath, mergedAssessments);
  saveJson(irosPath, mergedIros);
  saveJson(evidencePath, mergedEvidence);

  console.log(`✓ Assessments: ${mergedAssessments.length} total (${demoSeed.assessments.length} demo)`);
  console.log(`✓ IROs: ${mergedIros.length} total (${demoSeed.iros.length} demo)`);
  console.log(`✓ Evidence: ${mergedEvidence.length} total (${demoSeed.evidence.length} demo)`);
  console.log("\nDemo data loaded successfully!");
  console.log("\nDemo organizations:");
  console.log("  1. tech-corp (Tech Corp) - Software/Cloud");
  console.log("  2. mfg-inc (Mfg Inc) - Manufacturing");
  console.log("\nEach organization has:");
  console.log("  - 1 DMA assessment for 2024");
  console.log("  - 10 IROs (scored with impact/financial materiality)");
  console.log("  - 20+ evidence links (internal + external stakeholder sources)");
}

main();
