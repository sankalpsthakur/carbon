'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * FileStore — lightweight JSON-file-backed document store.
 *
 * Each collection is a single JSON file at <dataDir>/<collection>.json
 * containing an array of documents.  Every write appends an entry to
 * <dataDir>/_audit_log.json with a timestamp and SHA-256 content hash.
 *
 * Zero external dependencies — Node built-ins only (fs, path, crypto).
 */
class FileStore {
  /**
   * @param {string} dataDir - directory for JSON collection files
   */
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Absolute path to a collection file */
  _collectionPath(collection) {
    return path.join(this.dataDir, `${collection}.json`);
  }

  /** Read the full array for a collection (returns [] if file missing) */
  _readCollection(collection) {
    const p = this._collectionPath(collection);
    if (!fs.existsSync(p)) return [];
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return [];
    }
  }

  /** Persist an array to disk and append to audit log */
  _writeCollection(collection, docs, operation) {
    const p = this._collectionPath(collection);
    const json = JSON.stringify(docs, null, 2);
    fs.writeFileSync(p, json, 'utf8');
    this._appendAudit(collection, operation, json);
  }

  /** Append an entry to _audit_log.json */
  _appendAudit(collection, operation, json) {
    const logPath = path.join(this.dataDir, '_audit_log.json');
    let log = [];
    if (fs.existsSync(logPath)) {
      try {
        log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      } catch {
        log = [];
      }
    }

    const hash = crypto.createHash('sha256').update(json).digest('hex');
    log.push({
      timestamp: new Date().toISOString(),
      collection,
      operation,
      sha256: hash,
    });

    fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
  }

  /** Check if a document matches a query (all query fields must match) */
  _matches(doc, query) {
    if (!query || Object.keys(query).length === 0) return true;
    return Object.entries(query).every(([k, v]) => doc[k] === v);
  }

  /** Generate a random document id */
  _generateId() {
    return crypto.randomBytes(12).toString('hex');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Find one document matching the query.
   * @param {string} collection
   * @param {object} query - key/value pairs to match
   * @returns {object|null}
   */
  get(collection, query) {
    const docs = this._readCollection(collection);
    return docs.find((d) => this._matches(d, query)) || null;
  }

  /**
   * Find all documents matching the query.
   * @param {string} collection
   * @param {object} [query] - key/value pairs to match (omit for all)
   * @param {number} [limit] - max docs to return (0 = unlimited)
   * @returns {object[]}
   */
  list(collection, query, limit) {
    const docs = this._readCollection(collection);
    const matched = query ? docs.filter((d) => this._matches(d, query)) : docs;
    if (limit && limit > 0) return matched.slice(0, limit);
    return matched;
  }

  /**
   * Upsert a document.  If doc._id exists in collection, replace it;
   * otherwise insert.  Auto-generates _id if missing.
   * @param {string} collection
   * @param {object} doc
   * @returns {object} the persisted document (with _id)
   */
  set(collection, doc) {
    if (!doc._id) {
      doc._id = this._generateId();
    }
    const docs = this._readCollection(collection);
    const idx = docs.findIndex((d) => d._id === doc._id);
    if (idx >= 0) {
      docs[idx] = doc;
    } else {
      docs.push(doc);
    }
    this._writeCollection(collection, docs, 'set');
    return doc;
  }

  /**
   * Delete all documents matching the query.
   * @param {string} collection
   * @param {object} query
   * @returns {number} count of deleted documents
   */
  delete(collection, query) {
    const docs = this._readCollection(collection);
    const remaining = docs.filter((d) => !this._matches(d, query));
    const deleted = docs.length - remaining.length;
    if (deleted > 0) {
      this._writeCollection(collection, remaining, 'delete');
    }
    return deleted;
  }
}

module.exports = { FileStore };
