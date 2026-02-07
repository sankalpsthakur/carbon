# 01: Unified Database Layer

## Problem

Each of the 3 MCP servers embeds its own `FileStore` class with slightly different APIs:
- `calc-mcp.js` lines 38-118: Uses `crypto.randomUUID()`, `_updated_at`/`_created_at` timestamps
- `exec-mcp.js` lines 53-132: Uses `crypto.randomUUID()`, `_updated`/`_created` timestamps
- `strategy-mcp.js` lines 37-113: Uses `crypto.randomUUID()`, `updated_at`/`created_at` (no underscore)
- `shared-services/tools/db-adapter.js` lines 16-157: Uses `crypto.randomBytes(12)`, has audit log, no auto-timestamps

All use JSON file persistence with no concurrent write safety.

## Solution

Replace all 4 implementations with a single `store-adapter.js` factory supporting 2 backends (file + sqlite). Postgres is planned but not supported yet.

## Files to Create

### `plugins/shared-services/tools/store-adapter.js`

Factory function returning backend-specific store:

```javascript
const { createStore } = require('./store-adapter');
const store = createStore({
  backend: process.env.CARBONKIT_DB_BACKEND || 'sqlite',
  dbPath: process.env.CARBONKIT_SQLITE_PATH || '~/.carbonkit/data/carbonkit.db',
  pgUrl: process.env.CARBONKIT_PG_URL,
  dataDir: path.resolve(__dirname, '..', 'data'),  // fallback for file backend
  serverName: 'calc-mcp'  // for audit logging
});
```

### Unified Interface

```javascript
class StoreAdapter {
  get(collection, query)           // -> doc | null
  list(collection, query, limit)   // -> doc[]
  set(collection, doc)             // -> doc (with _id, _created_at, _updated_at)
  delete(collection, query)        // -> { removed: number }
  bulkSet(collection, docs)        // -> doc[] (batch insert for ingest)
  transaction(fn)                  // -> result (atomic multi-collection ops)
  close()                          // -> void (flush + disconnect)
  _generateId()                    // -> string (preserved for calc-mcp compatibility)
}
```

### `plugins/shared-services/tools/backends/file-store.js`

Extracted from `db-adapter.js` with normalized timestamps. Backward-compatible fallback.

### `plugins/shared-services/tools/backends/sqlite-store.js`

- Dependency: `better-sqlite3` (synchronous, zero external service)
- WAL mode for concurrent reads: `PRAGMA journal_mode=WAL`
- One table per collection, lazy creation on first write:

```sql
CREATE TABLE IF NOT EXISTS "{collection}" (
  _id TEXT PRIMARY KEY,
  doc JSON NOT NULL,
  _created_at TEXT NOT NULL DEFAULT (datetime('now')),
  _updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- JSON1 indexes for common query patterns:

```sql
CREATE INDEX idx_activity_rows_job_id ON activity_rows (json_extract(doc, '$.job_id'));
CREATE INDEX idx_engagements_supplier_id ON engagements (json_extract(doc, '$.supplier_id'));
CREATE INDEX idx_iros_assessment ON iros (json_extract(doc, '$.assessment_id'));
```

- Query translation: `store.get('jobs', { _id: 'abc' })` becomes `SELECT doc FROM jobs WHERE _id = 'abc' LIMIT 1`
- Multi-field queries: `WHERE json_extract(doc, '$.field1') = ? AND json_extract(doc, '$.field2') = ?`

### `plugins/shared-services/tools/backends/postgres-store.js` (Planned)

Postgres support is not enabled in the current SDK layer. The backend file exists as a placeholder for future work.

### `plugins/shared-services/tools/migrate-filestore.js`

```bash
# Migrate from JSON files to SQLite
node shared-services/tools/migrate-filestore.js --from file --to sqlite

# Postgres migration is not supported yet.
```

Handles: timestamp normalization, ID preservation, audit log migration, idempotent (safe to run multiple times).

## Files to Modify

| File | Lines to Change | Action |
|------|----------------|--------|
| `scope3-calculation/tools/calc-mcp.js` | 38-118 | Delete inline FileStore, add 3-line import |
| `scope3-execution/tools/exec-mcp.js` | 53-132 | Delete inline FileStore, add 3-line import |
| `scope3-strategy/tools/strategy-mcp.js` | 37-113 | Delete inline FileStore, add 3-line import |
| `plugins/package.json` | dependencies | Add `better-sqlite3` |

## Environment Variables

```env
CARBONKIT_DB_BACKEND=sqlite     # sqlite | file
CARBONKIT_SQLITE_PATH=~/.carbonkit/data/carbonkit.db
CARBONKIT_PG_URL=               # (reserved for future Postgres support)
```

## Design Decisions

1. **SQLite default** - zero config, single file, WAL for concurrent reads
2. **JSON-in-column** over normalized SQL - preserves flexible document model, avoids rigid schemas for 30+ collections
3. **`_generateId()` preserved** - calc-mcp calls it directly in 6 places (lines 381, 391, 421, 422, 445, 468)
4. **Unified timestamps** - all servers normalized to `_created_at` / `_updated_at`
5. **Audit log in DB** - migrated from `_audit_log.json` to `audit_log` table with SHA-256 hashes
