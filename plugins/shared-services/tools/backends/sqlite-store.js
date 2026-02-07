'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

/**
 * SQLite backend for CarbonKit store adapter.
 * Uses better-sqlite3 with WAL mode. One table per collection.
 * Doc column stores the full document as JSON.
 */
class SqliteBackend {
  /**
   * @param {string} dataDir    - directory for the SQLite database file
   * @param {string} serverName - used in audit log entries
   */
  constructor(dataDir, serverName) {
    this._dir = path.resolve(dataDir);
    this._serverName = serverName || 'unknown';
    if (!fs.existsSync(this._dir)) {
      fs.mkdirSync(this._dir, { recursive: true });
    }

    const Database = require('better-sqlite3');
    const dbPath = path.join(this._dir, 'carbonkit.db');
    this._db = new Database(dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('foreign_keys = ON');

    // Ensure audit log table exists
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS _audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        server TEXT NOT NULL,
        collection TEXT NOT NULL,
        operation TEXT NOT NULL,
        sha256 TEXT NOT NULL
      )
    `);

    this._ensuredTables = new Set(['_audit_log']);
  }

  // ---- internal helpers ----

  _sanitize(collection) {
    return String(collection).replace(/[^a-zA-Z0-9_]/g, '_');
  }

  _ensureTable(collection) {
    const tbl = this._sanitize(collection);
    if (this._ensuredTables.has(tbl)) return tbl;

    this._db.exec(`
      CREATE TABLE IF NOT EXISTS "${tbl}" (
        _id TEXT PRIMARY KEY,
        doc JSON NOT NULL,
        _created_at TEXT NOT NULL,
        _updated_at TEXT NOT NULL
      )
    `);

    // JSON1 index on job_id (common query field)
    try {
      this._db.exec(`
        CREATE INDEX IF NOT EXISTS "idx_${tbl}_job_id"
        ON "${tbl}"(json_extract(doc, '$.job_id'))
      `);
    } catch (_e) {
      // Ignore if JSON1 extension not available
    }

    this._ensuredTables.add(tbl);
    return tbl;
  }

  _audit(collection, operation, json) {
    const hash = crypto.createHash('sha256').update(json).digest('hex');
    this._db.prepare(
      'INSERT INTO _audit_log (timestamp, server, collection, operation, sha256) VALUES (?, ?, ?, ?, ?)'
    ).run(new Date().toISOString(), this._serverName, collection, operation, hash);
  }

  _matches(doc, query) {
    if (!query || typeof query !== 'object' || Object.keys(query).length === 0) return true;
    for (const [k, v] of Object.entries(query)) {
      if (doc[k] !== v) return false;
    }
    return true;
  }

  _rowToDoc(row) {
    if (!row) return null;
    const doc = JSON.parse(row.doc);
    doc._id = row._id;
    doc._created_at = row._created_at;
    doc._updated_at = row._updated_at;
    return doc;
  }

  // ---- public API ----

  _generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  }

  /**
   * Return first doc matching query, or null.
   */
  get(collection, query) {
    const tbl = this._ensureTable(collection);

    // Fast path: query by _id
    if (query && query._id && Object.keys(query).length === 1) {
      const row = this._db.prepare(`SELECT * FROM "${tbl}" WHERE _id = ?`).get(query._id);
      return row ? this._rowToDoc(row) : null;
    }

    // Build WHERE clause from query using json_extract
    if (query && typeof query === 'object' && Object.keys(query).length > 0) {
      const conditions = [];
      const params = [];
      for (const [k, v] of Object.entries(query)) {
        if (k === '_id') {
          conditions.push('_id = ?');
          params.push(v);
        } else if (k === '_created_at' || k === '_updated_at') {
          conditions.push(`${k} = ?`);
          params.push(v);
        } else {
          conditions.push(`json_extract(doc, '$.' || ?) = ?`);
          params.push(k, typeof v === 'object' ? JSON.stringify(v) : v);
        }
      }
      const sql = `SELECT * FROM "${tbl}" WHERE ${conditions.join(' AND ')} LIMIT 1`;
      const row = this._db.prepare(sql).get(...params);
      return row ? this._rowToDoc(row) : null;
    }

    // No query - return first
    const row = this._db.prepare(`SELECT * FROM "${tbl}" LIMIT 1`).get();
    return row ? this._rowToDoc(row) : null;
  }

  /**
   * Return all docs matching query, with optional limit.
   */
  list(collection, query, limit) {
    const tbl = this._ensureTable(collection);

    // Build WHERE clause
    const conditions = [];
    const params = [];
    if (query && typeof query === 'object') {
      for (const [k, v] of Object.entries(query)) {
        if (k === '_id') {
          conditions.push('_id = ?');
          params.push(v);
        } else if (k === '_created_at' || k === '_updated_at') {
          conditions.push(`${k} = ?`);
          params.push(v);
        } else {
          conditions.push(`json_extract(doc, '$.' || ?) = ?`);
          params.push(k, typeof v === 'object' ? JSON.stringify(v) : v);
        }
      }
    }

    let sql = `SELECT * FROM "${tbl}"`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    if (typeof limit === 'number' && limit > 0) {
      sql += ` LIMIT ${Math.floor(limit)}`;
    }

    const rows = this._db.prepare(sql).all(...params);
    return rows.map((r) => this._rowToDoc(r));
  }

  /**
   * Upsert a document. Auto-generates _id if missing.
   */
  set(collection, doc) {
    if (!doc || typeof doc !== 'object') throw new Error('doc must be an object');
    const tbl = this._ensureTable(collection);
    const id = doc._id || this._generateId();
    const now = new Date().toISOString();

    doc._id = id;
    doc._updated_at = now;

    // Check if exists
    const existing = this._db.prepare(`SELECT * FROM "${tbl}" WHERE _id = ?`).get(id);

    if (existing) {
      const prev = JSON.parse(existing.doc);
      const merged = { ...prev, ...doc };
      merged._created_at = existing._created_at;
      merged._updated_at = now;
      merged._id = id;

      const json = JSON.stringify(merged);
      this._db.prepare(
        `UPDATE "${tbl}" SET doc = ?, _updated_at = ? WHERE _id = ?`
      ).run(json, now, id);
      this._audit(collection, 'set', json);
      return merged;
    }

    doc._created_at = now;
    const json = JSON.stringify(doc);
    this._db.prepare(
      `INSERT INTO "${tbl}" (_id, doc, _created_at, _updated_at) VALUES (?, ?, ?, ?)`
    ).run(id, json, now, now);
    this._audit(collection, 'set', json);
    return doc;
  }

  /**
   * Delete docs matching query. Requires non-empty query.
   * @returns {{ removed: number }}
   */
  delete(collection, query) {
    if (!query || typeof query !== 'object' || Object.keys(query).length === 0) {
      throw new Error('query must be a non-empty object to prevent accidental wipe');
    }

    const tbl = this._ensureTable(collection);

    // Fast path: delete by _id
    if (query._id && Object.keys(query).length === 1) {
      const info = this._db.prepare(`DELETE FROM "${tbl}" WHERE _id = ?`).run(query._id);
      if (info.changes > 0) {
        this._audit(collection, 'delete', JSON.stringify(query));
      }
      return { removed: info.changes };
    }

    // General: find matching docs then delete by _id
    const docs = this.list(collection, query);
    if (docs.length === 0) return { removed: 0 };

    const ids = docs.map((d) => d._id);
    const placeholders = ids.map(() => '?').join(',');
    const info = this._db.prepare(`DELETE FROM "${tbl}" WHERE _id IN (${placeholders})`).run(...ids);
    this._audit(collection, 'delete', JSON.stringify({ query, ids }));
    return { removed: info.changes };
  }

  /**
   * Bulk upsert an array of documents.
   * @returns {object[]} the persisted documents
   */
  bulkSet(collection, docsToWrite) {
    if (!Array.isArray(docsToWrite)) throw new Error('docsToWrite must be an array');
    const tbl = this._ensureTable(collection);
    const now = new Date().toISOString();
    const results = [];

    const transaction = this._db.transaction((docs) => {
      for (const doc of docs) {
        const id = doc._id || this._generateId();
        doc._id = id;
        doc._updated_at = now;

        const existing = this._db.prepare(`SELECT * FROM "${tbl}" WHERE _id = ?`).get(id);

        if (existing) {
          const prev = JSON.parse(existing.doc);
          const merged = { ...prev, ...doc };
          merged._created_at = existing._created_at;
          merged._updated_at = now;
          merged._id = id;

          const json = JSON.stringify(merged);
          this._db.prepare(
            `UPDATE "${tbl}" SET doc = ?, _updated_at = ? WHERE _id = ?`
          ).run(json, now, id);
          results.push(merged);
        } else {
          doc._created_at = now;
          const json = JSON.stringify(doc);
          this._db.prepare(
            `INSERT INTO "${tbl}" (_id, doc, _created_at, _updated_at) VALUES (?, ?, ?, ?)`
          ).run(id, json, now, now);
          results.push(doc);
        }
      }
    });

    transaction(docsToWrite);
    this._audit(collection, 'bulkSet', JSON.stringify({ count: docsToWrite.length }));
    return results;
  }

  /**
   * Count docs matching query.
   * @returns {number}
   */
  count(collection, query) {
    const tbl = this._ensureTable(collection);

    const conditions = [];
    const params = [];
    if (query && typeof query === 'object') {
      for (const [k, v] of Object.entries(query)) {
        if (k === '_id') {
          conditions.push('_id = ?');
          params.push(v);
        } else if (k === '_created_at' || k === '_updated_at') {
          conditions.push(`${k} = ?`);
          params.push(v);
        } else {
          conditions.push(`json_extract(doc, '$.' || ?) = ?`);
          params.push(k, typeof v === 'object' ? JSON.stringify(v) : v);
        }
      }
    }

    let sql = `SELECT COUNT(*) as cnt FROM "${tbl}"`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const row = this._db.prepare(sql).get(...params);
    return row.cnt;
  }

  close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}

module.exports = SqliteBackend;
