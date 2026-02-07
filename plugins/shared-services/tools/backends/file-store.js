'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * File-based backend for CarbonKit store adapter.
 * Stores each collection as a JSON array in a separate file.
 */
class FileBackend {
  /**
   * @param {string} dataDir  - directory for collection JSON files
   * @param {string} serverName - used in audit log entries
   */
  constructor(dataDir, serverName) {
    this._dir = path.resolve(dataDir);
    this._serverName = serverName || 'unknown';
    if (!fs.existsSync(this._dir)) {
      fs.mkdirSync(this._dir, { recursive: true });
    }
  }

  // ---- internal helpers ----

  _sanitize(collection) {
    return String(collection).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  _filePath(collection) {
    return path.join(this._dir, `${this._sanitize(collection)}.json`);
  }

  _readAll(collection) {
    const fp = this._filePath(collection);
    if (!fs.existsSync(fp)) return [];
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  _writeAll(collection, docs, operation) {
    const fp = this._filePath(collection);
    const json = JSON.stringify(docs, null, 2);
    fs.writeFileSync(fp, json, 'utf8');
    this._appendAudit(collection, operation, json);
  }

  _appendAudit(collection, operation, json) {
    const logPath = path.join(this._dir, '_audit_log.json');
    let log = [];
    if (fs.existsSync(logPath)) {
      try {
        log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      } catch (_e) {
        log = [];
      }
    }
    const hash = crypto.createHash('sha256').update(json).digest('hex');
    log.push({
      timestamp: new Date().toISOString(),
      server: this._serverName,
      collection,
      operation,
      sha256: hash,
    });
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
  }

  _matches(doc, query) {
    if (!query || typeof query !== 'object' || Object.keys(query).length === 0) return true;
    for (const [k, v] of Object.entries(query)) {
      if (doc[k] !== v) return false;
    }
    return true;
  }

  // ---- public API ----

  _generateId() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
  }

  /**
   * Return first doc matching query, or null.
   */
  get(collection, query) {
    const docs = this._readAll(collection);
    return docs.find((d) => this._matches(d, query)) ?? null;
  }

  /**
   * Return all docs matching query, with optional limit.
   */
  list(collection, query, limit) {
    const docs = this._readAll(collection);
    let results = docs.filter((d) => this._matches(d, query));
    if (typeof limit === 'number' && limit > 0) {
      results = results.slice(0, limit);
    }
    return results;
  }

  /**
   * Upsert a document. Auto-generates _id if missing.
   * Normalizes timestamps to _created_at / _updated_at.
   */
  set(collection, doc) {
    if (!doc || typeof doc !== 'object') throw new Error('doc must be an object');
    const docs = this._readAll(collection);
    const id = doc._id || this._generateId();
    const now = new Date().toISOString();

    doc._id = id;
    doc._updated_at = now;

    const idx = docs.findIndex((d) => d._id === id);
    if (idx >= 0) {
      const existing = docs[idx];
      docs[idx] = { ...existing, ...doc, _created_at: existing._created_at || now };
    } else {
      doc._created_at = now;
      docs.push(doc);
    }
    this._writeAll(collection, docs, 'set');
    return idx >= 0 ? docs[idx] : doc;
  }

  /**
   * Delete docs matching query. Requires non-empty query to prevent accidental wipe.
   * @returns {{ removed: number }}
   */
  delete(collection, query) {
    if (!query || typeof query !== 'object' || Object.keys(query).length === 0) {
      throw new Error('query must be a non-empty object to prevent accidental wipe');
    }
    const docs = this._readAll(collection);
    const remaining = docs.filter((d) => !this._matches(d, query));
    const removed = docs.length - remaining.length;
    if (removed > 0) {
      this._writeAll(collection, remaining, 'delete');
    }
    return { removed };
  }

  /**
   * Bulk upsert an array of documents.
   * @returns {object[]} the persisted documents
   */
  bulkSet(collection, docsToWrite) {
    if (!Array.isArray(docsToWrite)) throw new Error('docsToWrite must be an array');
    const existing = this._readAll(collection);
    const now = new Date().toISOString();
    const idMap = new Map(existing.map((d) => [d._id, d]));
    const results = [];

    for (const doc of docsToWrite) {
      const id = doc._id || this._generateId();
      doc._id = id;
      doc._updated_at = now;

      const prev = idMap.get(id);
      if (prev) {
        const merged = { ...prev, ...doc, _created_at: prev._created_at || now };
        idMap.set(id, merged);
        results.push(merged);
      } else {
        doc._created_at = now;
        idMap.set(id, doc);
        results.push(doc);
      }
    }

    this._writeAll(collection, [...idMap.values()], 'bulkSet');
    return results;
  }

  /**
   * Count docs matching query.
   * @returns {number}
   */
  count(collection, query) {
    const docs = this._readAll(collection);
    return docs.filter((d) => this._matches(d, query)).length;
  }

  close() {
    // No-op for file backend
  }
}

module.exports = FileBackend;
