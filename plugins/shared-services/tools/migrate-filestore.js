#!/usr/bin/env node
'use strict';

/**
 * CarbonKit data migration tool.
 *
 * Usage:
 *   node migrate-filestore.js --from file --to sqlite [--data-dir <path>] [--server-name <name>]
 *   node migrate-filestore.js --from file --to postgres --pg-url <url>
 *
 * Reads all .json collection files from the data directory,
 * normalizes timestamps to _created_at/_updated_at,
 * writes to the target backend, and verifies record counts.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--from') { args.from = argv[++i]; continue; }
    if (key === '--to') { args.to = argv[++i]; continue; }
    if (key === '--data-dir') { args.dataDir = argv[++i]; continue; }
    if (key === '--server-name') { args.serverName = argv[++i]; continue; }
    if (key === '--pg-url') { args.pgUrl = argv[++i]; continue; }
    if (key === '--help' || key === '-h') { args.help = true; continue; }
  }
  return args;
}

function usage() {
  console.log(`
CarbonKit Data Migration Tool

Usage:
  node migrate-filestore.js --from <backend> --to <backend> [options]

Backends: file, sqlite, postgres

Options:
  --data-dir <path>      Data directory (default: searches plugin data dirs)
  --server-name <name>   Server name for audit log (default: migration)
  --pg-url <url>         Postgres connection string (for postgres backend)
  --help                 Show this help

Examples:
  node migrate-filestore.js --from file --to sqlite
  node migrate-filestore.js --from file --to sqlite --data-dir ./scope3-calculation/data
  node migrate-filestore.js --from file --to postgres --pg-url postgres://user:pass@localhost/carbonkit
`);
}

// ---------------------------------------------------------------------------
// Timestamp normalization
// ---------------------------------------------------------------------------

function normalizeTimestamps(doc) {
  const normalized = { ...doc };

  // Normalize various timestamp field names to _created_at/_updated_at
  if (!normalized._created_at) {
    normalized._created_at =
      normalized.created_at ||
      normalized._created ||
      normalized.createdAt ||
      new Date().toISOString();
  }
  if (!normalized._updated_at) {
    normalized._updated_at =
      normalized.updated_at ||
      normalized._updated ||
      normalized.updatedAt ||
      normalized._created_at;
  }

  // Remove old timestamp fields
  delete normalized.created_at;
  delete normalized._created;
  delete normalized.createdAt;
  delete normalized.updated_at;
  delete normalized._updated;
  delete normalized.updatedAt;

  return normalized;
}

// ---------------------------------------------------------------------------
// Discovery: find all data directories in the plugins tree
// ---------------------------------------------------------------------------

function discoverDataDirs(pluginsRoot) {
  const dataDirs = [];
  const entries = fs.readdirSync(pluginsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const dataDir = path.join(pluginsRoot, entry.name, 'data');
    if (fs.existsSync(dataDir)) {
      dataDirs.push(dataDir);
    }
  }
  return dataDirs;
}

// ---------------------------------------------------------------------------
// Read collections from file backend
// ---------------------------------------------------------------------------

function readFileCollections(dataDir) {
  const collections = {};
  if (!fs.existsSync(dataDir)) return collections;

  const files = fs.readdirSync(dataDir).filter((f) =>
    f.endsWith('.json') && !f.startsWith('_') && !f.startsWith('export_')
  );

  for (const file of files) {
    const collectionName = file.replace(/\.json$/, '');
    const filePath = path.join(dataDir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        collections[collectionName] = parsed.map(normalizeTimestamps);
      }
    } catch (e) {
      console.warn(`  Warning: could not parse ${file}: ${e.message}`);
    }
  }

  return collections;
}

// ---------------------------------------------------------------------------
// Main migration
// ---------------------------------------------------------------------------

async function migrate(opts) {
  const { createStore } = require('./store-adapter');

  const fromBackend = opts.from;
  const toBackend = opts.to;
  const serverName = opts.serverName || 'migration';

  console.log(`\nMigrating: ${fromBackend} -> ${toBackend}`);
  console.log('─'.repeat(50));

  // Determine data directories to migrate
  let dataDirs;
  if (opts.dataDir) {
    dataDirs = [path.resolve(opts.dataDir)];
  } else {
    const pluginsRoot = path.resolve(__dirname, '..', '..');
    dataDirs = discoverDataDirs(pluginsRoot);
  }

  if (dataDirs.length === 0) {
    console.log('No data directories found.');
    return;
  }

  console.log(`Found ${dataDirs.length} data director${dataDirs.length === 1 ? 'y' : 'ies'}:`);
  for (const d of dataDirs) console.log(`  ${d}`);
  console.log('');

  let totalCollections = 0;
  let totalDocs = 0;
  let totalVerified = 0;
  const errors = [];

  for (const dataDir of dataDirs) {
    const dirName = path.basename(path.dirname(dataDir));
    console.log(`Processing: ${dirName}/data`);

    // Read source collections
    let collections;
    if (fromBackend === 'file') {
      collections = readFileCollections(dataDir);
    } else {
      // For non-file sources, use store adapter to read
      const sourceStore = createStore({ backend: fromBackend, dataDir, serverName });
      // We'd need to know collection names - for now this only works from file
      console.warn(`  Warning: migration from '${fromBackend}' not yet supported. Skipping.`);
      if (typeof sourceStore.close === 'function') sourceStore.close();
      continue;
    }

    const collectionNames = Object.keys(collections);
    if (collectionNames.length === 0) {
      console.log('  No collections found.\n');
      continue;
    }

    // Create target store
    const targetOpts = {
      backend: toBackend,
      dataDir,
      serverName,
    };
    if (toBackend === 'postgres') {
      targetOpts.connectionString = opts.pgUrl || process.env.CARBONKIT_PG_URL;
      if (!targetOpts.connectionString) {
        console.error('  Error: postgres backend requires --pg-url or CARBONKIT_PG_URL env var');
        errors.push(`${dirName}: missing postgres connection string`);
        continue;
      }
    }

    const targetStore = createStore(targetOpts);

    for (const collName of collectionNames) {
      const docs = collections[collName];
      console.log(`  ${collName}: ${docs.length} docs`);
      totalCollections++;
      totalDocs += docs.length;

      try {
        // Write documents via bulkSet for efficiency
        if (docs.length > 0) {
          if (typeof targetStore.bulkSet === 'function') {
            const result = targetStore._async
              ? await targetStore.bulkSet(collName, docs)
              : targetStore.bulkSet(collName, docs);
            if (result.length !== docs.length) {
              console.warn(`    WARNING: wrote ${result.length}/${docs.length} docs`);
            }
          } else {
            // Fallback to individual set
            for (const doc of docs) {
              if (targetStore._async) {
                await targetStore.set(collName, doc);
              } else {
                targetStore.set(collName, doc);
              }
            }
          }
        }

        // Verify count
        let targetCount;
        if (typeof targetStore.count === 'function') {
          targetCount = targetStore._async
            ? await targetStore.count(collName)
            : targetStore.count(collName);
        } else {
          const listed = targetStore._async
            ? await targetStore.list(collName)
            : targetStore.list(collName);
          targetCount = listed.length;
        }

        if (targetCount === docs.length) {
          console.log(`    Verified: ${targetCount} records`);
          totalVerified += targetCount;
        } else {
          console.warn(`    MISMATCH: source=${docs.length}, target=${targetCount}`);
          errors.push(`${dirName}/${collName}: count mismatch (${docs.length} vs ${targetCount})`);
        }
      } catch (e) {
        console.error(`    Error migrating ${collName}: ${e.message}`);
        errors.push(`${dirName}/${collName}: ${e.message}`);
      }
    }

    // Close target store
    if (typeof targetStore.close === 'function') {
      if (targetStore._async) {
        await targetStore.close();
      } else {
        targetStore.close();
      }
    }

    console.log('');
  }

  // Summary
  console.log('─'.repeat(50));
  console.log(`Migration complete.`);
  console.log(`  Collections: ${totalCollections}`);
  console.log(`  Documents:   ${totalDocs}`);
  console.log(`  Verified:    ${totalVerified}`);
  if (errors.length > 0) {
    console.log(`  Errors:      ${errors.length}`);
    for (const e of errors) console.log(`    - ${e}`);
    process.exit(1);
  } else {
    console.log('  Status:      OK');
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv);

if (args.help) {
  usage();
  process.exit(0);
}

if (!args.from || !args.to) {
  console.error('Error: --from and --to are required');
  usage();
  process.exit(1);
}

const validBackends = ['file', 'sqlite', 'postgres'];
if (!validBackends.includes(args.from)) {
  console.error(`Error: invalid --from backend: ${args.from}`);
  process.exit(1);
}
if (!validBackends.includes(args.to)) {
  console.error(`Error: invalid --to backend: ${args.to}`);
  process.exit(1);
}

migrate(args).catch((err) => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
