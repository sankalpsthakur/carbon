'use strict';

const crypto = require('crypto');

/**
 * PostgreSQL backend for CarbonKit store adapter.
 * Uses the pg module with connection pooling and JSONB storage.
 *
 * Table structure per collection:
 *   _id TEXT PRIMARY KEY, doc JSONB NOT NULL, _created_at TIMESTAMPTZ, _updated_at TIMESTAMPTZ
 *
 * All public methods are async. The store-adapter wraps them transparently.
 */
class PostgresBackend {
  /**
   * @param {object} opts
   * @param {string} opts.connectionString - Postgres connection string
   * @param {string} [opts.serverName]     - used in audit log
   * @param {number} [opts.poolMax]        - max pool size (default 10)
   */
  constructor(opts) {
    this._serverName = opts.serverName || 'unknown';
    this._async = true; // flag for adapter to know methods return promises

    const { Pool } = require('pg');
    this._pool = new Pool({
      connectionString: opts.connectionString || process.env.CARBONKIT_PG_URL,
      max: opts.poolMax || 10,
    });

    this._ensuredTables = new Set();
    this._initPromise = this._initAuditTable();
  }

  async _initAuditTable() {
    await this._pool.query(`
      CREATE TABLE IF NOT EXISTS _audit_log (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        server TEXT NOT NULL,
        collection TEXT NOT NULL,
        operation TEXT NOT NULL,
        sha256 TEXT NOT NULL
      )
    `);
  }

  // ---- internal helpers ----

  _sanitize(collection) {
    return String(collection).replace(/[^a-zA-Z0-9_]/g, '_');
  }

  async _ensureTable(collection) {
    const tbl = this._sanitize(collection);
    if (this._ensuredTables.has(tbl)) return tbl;
    await this._initPromise;

    await this._pool.query(`
      CREATE TABLE IF NOT EXISTS "${tbl}" (
        _id TEXT PRIMARY KEY,
        doc JSONB NOT NULL,
        _created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        _updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // GIN index on doc for efficient JSONB queries
    await this._pool.query(`
      CREATE INDEX IF NOT EXISTS "idx_${tbl}_doc_gin" ON "${tbl}" USING GIN (doc)
    `).catch(() => { /* ignore if already exists or not supported */ });

    // B-tree index on common job_id field
    await this._pool.query(`
      CREATE INDEX IF NOT EXISTS "idx_${tbl}_job_id"
      ON "${tbl}" ((doc->>'job_id'))
    `).catch(() => { /* ignore */ });

    this._ensuredTables.add(tbl);
    return tbl;
  }

  async _audit(collection, operation, json) {
    const hash = crypto.createHash('sha256').update(json).digest('hex');
    await this._pool.query(
      'INSERT INTO _audit_log (timestamp, server, collection, operation, sha256) VALUES (NOW(), $1, $2, $3, $4)',
      [this._serverName, collection, operation, hash]
    );
  }

  _rowToDoc(row) {
    if (!row) return null;
    const doc = typeof row.doc === 'string' ? JSON.parse(row.doc) : row.doc;
    doc._id = row._id;
    doc._created_at = row._created_at instanceof Date ? row._created_at.toISOString() : row._created_at;
    doc._updated_at = row._updated_at instanceof Date ? row._updated_at.toISOString() : row._updated_at;
    return doc;
  }

  // ---- public API (all async) ----

  _generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  }

  /**
   * Return first doc matching query, or null.
   */
  async get(collection, query) {
    const tbl = await this._ensureTable(collection);

    if (query && query._id && Object.keys(query).length === 1) {
      const { rows } = await this._pool.query(`SELECT * FROM "${tbl}" WHERE _id = $1 LIMIT 1`, [query._id]);
      return rows.length > 0 ? this._rowToDoc(rows[0]) : null;
    }

    if (query && typeof query === 'object' && Object.keys(query).length > 0) {
      const conditions = [];
      const params = [];
      let idx = 1;
      for (const [k, v] of Object.entries(query)) {
        if (k === '_id') {
          conditions.push(`_id = $${idx++}`);
          params.push(v);
        } else if (k === '_created_at' || k === '_updated_at') {
          conditions.push(`${k} = $${idx++}`);
          params.push(v);
        } else {
          conditions.push(`doc->>'${this._sanitize(k)}' = $${idx++}`);
          params.push(typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
      }
      const sql = `SELECT * FROM "${tbl}" WHERE ${conditions.join(' AND ')} LIMIT 1`;
      const { rows } = await this._pool.query(sql, params);
      return rows.length > 0 ? this._rowToDoc(rows[0]) : null;
    }

    const { rows } = await this._pool.query(`SELECT * FROM "${tbl}" LIMIT 1`);
    return rows.length > 0 ? this._rowToDoc(rows[0]) : null;
  }

  /**
   * Return all docs matching query, with optional limit.
   */
  async list(collection, query, limit) {
    const tbl = await this._ensureTable(collection);

    const conditions = [];
    const params = [];
    let idx = 1;

    if (query && typeof query === 'object') {
      for (const [k, v] of Object.entries(query)) {
        if (k === '_id') {
          conditions.push(`_id = $${idx++}`);
          params.push(v);
        } else if (k === '_created_at' || k === '_updated_at') {
          conditions.push(`${k} = $${idx++}`);
          params.push(v);
        } else {
          conditions.push(`doc->>'${this._sanitize(k)}' = $${idx++}`);
          params.push(typeof v === 'object' ? JSON.stringify(v) : String(v));
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

    const { rows } = await this._pool.query(sql, params);
    return rows.map((r) => this._rowToDoc(r));
  }

  /**
   * Upsert a document.
   */
  async set(collection, doc) {
    if (!doc || typeof doc !== 'object') throw new Error('doc must be an object');
    const tbl = await this._ensureTable(collection);
    const id = doc._id || this._generateId();
    const now = new Date().toISOString();

    doc._id = id;
    doc._updated_at = now;

    const { rows: existingRows } = await this._pool.query(
      `SELECT * FROM "${tbl}" WHERE _id = $1`, [id]
    );

    if (existingRows.length > 0) {
      const prev = this._rowToDoc(existingRows[0]);
      const merged = { ...prev, ...doc };
      merged._created_at = existingRows[0]._created_at instanceof Date
        ? existingRows[0]._created_at.toISOString()
        : existingRows[0]._created_at;
      merged._updated_at = now;
      merged._id = id;

      const json = JSON.stringify(merged);
      await this._pool.query(
        `UPDATE "${tbl}" SET doc = $1::jsonb, _updated_at = $2 WHERE _id = $3`,
        [json, now, id]
      );
      await this._audit(collection, 'set', json);
      return merged;
    }

    doc._created_at = now;
    const json = JSON.stringify(doc);
    await this._pool.query(
      `INSERT INTO "${tbl}" (_id, doc, _created_at, _updated_at) VALUES ($1, $2::jsonb, $3, $4)`,
      [id, json, now, now]
    );
    await this._audit(collection, 'set', json);
    return doc;
  }

  /**
   * Delete docs matching query. Requires non-empty query.
   */
  async delete(collection, query) {
    if (!query || typeof query !== 'object' || Object.keys(query).length === 0) {
      throw new Error('query must be a non-empty object to prevent accidental wipe');
    }

    const tbl = await this._ensureTable(collection);

    if (query._id && Object.keys(query).length === 1) {
      const { rowCount } = await this._pool.query(`DELETE FROM "${tbl}" WHERE _id = $1`, [query._id]);
      if (rowCount > 0) {
        await this._audit(collection, 'delete', JSON.stringify(query));
      }
      return { removed: rowCount };
    }

    // General: find then delete
    const docs = await this.list(collection, query);
    if (docs.length === 0) return { removed: 0 };

    const ids = docs.map((d) => d._id);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rowCount } = await this._pool.query(
      `DELETE FROM "${tbl}" WHERE _id IN (${placeholders})`, ids
    );
    await this._audit(collection, 'delete', JSON.stringify({ query, ids }));
    return { removed: rowCount };
  }

  /**
   * Bulk upsert an array of documents.
   */
  async bulkSet(collection, docsToWrite) {
    if (!Array.isArray(docsToWrite)) throw new Error('docsToWrite must be an array');
    const tbl = await this._ensureTable(collection);
    const now = new Date().toISOString();
    const results = [];

    const client = await this._pool.connect();
    try {
      await client.query('BEGIN');

      for (const doc of docsToWrite) {
        const id = doc._id || this._generateId();
        doc._id = id;
        doc._updated_at = now;

        const { rows: existingRows } = await client.query(
          `SELECT * FROM "${tbl}" WHERE _id = $1`, [id]
        );

        if (existingRows.length > 0) {
          const prev = this._rowToDoc(existingRows[0]);
          const merged = { ...prev, ...doc };
          merged._created_at = existingRows[0]._created_at instanceof Date
            ? existingRows[0]._created_at.toISOString()
            : existingRows[0]._created_at;
          merged._updated_at = now;
          merged._id = id;

          const json = JSON.stringify(merged);
          await client.query(
            `UPDATE "${tbl}" SET doc = $1::jsonb, _updated_at = $2 WHERE _id = $3`,
            [json, now, id]
          );
          results.push(merged);
        } else {
          doc._created_at = now;
          const json = JSON.stringify(doc);
          await client.query(
            `INSERT INTO "${tbl}" (_id, doc, _created_at, _updated_at) VALUES ($1, $2::jsonb, $3, $4)`,
            [id, json, now, now]
          );
          results.push(doc);
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    await this._audit(collection, 'bulkSet', JSON.stringify({ count: docsToWrite.length }));
    return results;
  }

  /**
   * Count docs matching query.
   */
  async count(collection, query) {
    const tbl = await this._ensureTable(collection);

    const conditions = [];
    const params = [];
    let idx = 1;

    if (query && typeof query === 'object') {
      for (const [k, v] of Object.entries(query)) {
        if (k === '_id') {
          conditions.push(`_id = $${idx++}`);
          params.push(v);
        } else if (k === '_created_at' || k === '_updated_at') {
          conditions.push(`${k} = $${idx++}`);
          params.push(v);
        } else {
          conditions.push(`doc->>'${this._sanitize(k)}' = $${idx++}`);
          params.push(typeof v === 'object' ? JSON.stringify(v) : String(v));
        }
      }
    }

    let sql = `SELECT COUNT(*)::int as cnt FROM "${tbl}"`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    const { rows } = await this._pool.query(sql, params);
    return rows[0].cnt;
  }

  async close() {
    if (this._pool) {
      await this._pool.end();
      this._pool = null;
    }
  }
}

module.exports = PostgresBackend;
