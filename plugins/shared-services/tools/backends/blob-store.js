'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Content-addressed binary file storage for CarbonKit.
 * Files are stored by SHA-256 hash: {basePath}/{prefix_2}/{sha256}
 * Metadata stored alongside as {sha256}.meta.json
 */
class BlobStore {
  /**
   * @param {object} opts
   * @param {string} opts.basePath - root directory for blob storage
   */
  constructor(opts) {
    this._basePath = path.resolve(opts.basePath || opts.dataDir || '.');
    if (!fs.existsSync(this._basePath)) {
      fs.mkdirSync(this._basePath, { recursive: true });
    }
  }

  // ---- internal helpers ----

  _sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  _blobDir(sha256) {
    const prefix = sha256.slice(0, 2);
    return path.join(this._basePath, prefix);
  }

  _blobPath(sha256) {
    return path.join(this._blobDir(sha256), sha256);
  }

  _metaPath(sha256) {
    return path.join(this._blobDir(sha256), `${sha256}.meta.json`);
  }

  // ---- public API ----

  /**
   * Store a binary blob. Returns { key, size, sha256 }.
   * @param {string} key      - logical key (e.g. filename or ID)
   * @param {Buffer} buffer   - binary content
   * @param {object} metadata - optional metadata to store alongside
   */
  put(key, buffer, metadata) {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('buffer must be a Buffer');
    }

    const sha256 = this._sha256(buffer);
    const dir = this._blobDir(sha256);
    const blobPath = this._blobPath(sha256);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write binary (idempotent if content-addressed)
    fs.writeFileSync(blobPath, buffer);

    // Write metadata
    const meta = {
      key,
      sha256,
      size: buffer.length,
      content_type: metadata?.content_type || 'application/octet-stream',
      stored_at: new Date().toISOString(),
      ...(metadata || {}),
    };
    fs.writeFileSync(this._metaPath(sha256), JSON.stringify(meta, null, 2), 'utf8');

    return { key, size: buffer.length, sha256 };
  }

  /**
   * Retrieve a blob by SHA-256 hash.
   * @param {string} sha256
   * @returns {{ buffer: Buffer, metadata: object } | null}
   */
  get(sha256) {
    const blobPath = this._blobPath(sha256);
    if (!fs.existsSync(blobPath)) return null;

    const buffer = fs.readFileSync(blobPath);
    let metadata = {};
    const metaPath = this._metaPath(sha256);
    if (fs.existsSync(metaPath)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (_e) {
        metadata = {};
      }
    }

    return { buffer, metadata };
  }

  /**
   * Check if a blob exists.
   * @param {string} sha256
   * @returns {boolean}
   */
  exists(sha256) {
    return fs.existsSync(this._blobPath(sha256));
  }

  /**
   * Delete a blob by SHA-256 hash.
   * @param {string} sha256
   * @returns {boolean} true if deleted, false if not found
   */
  delete(sha256) {
    const blobPath = this._blobPath(sha256);
    const metaPath = this._metaPath(sha256);

    if (!fs.existsSync(blobPath)) return false;

    fs.unlinkSync(blobPath);
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }

    // Clean up empty prefix directory
    const dir = this._blobDir(sha256);
    try {
      const entries = fs.readdirSync(dir);
      if (entries.length === 0) {
        fs.rmdirSync(dir);
      }
    } catch (_e) {
      // ignore cleanup errors
    }

    return true;
  }

  /**
   * List blob SHA-256 hashes, optionally filtered by prefix directory.
   * @param {string} [prefix] - 2-char hex prefix to filter by
   * @returns {string[]}
   */
  list(prefix) {
    const results = [];

    if (prefix) {
      const dir = path.join(this._basePath, prefix);
      if (!fs.existsSync(dir)) return results;
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (!entry.endsWith('.meta.json') && entry.length === 64) {
          results.push(entry);
        }
      }
      return results;
    }

    // List all prefix directories
    if (!fs.existsSync(this._basePath)) return results;
    const prefixDirs = fs.readdirSync(this._basePath, { withFileTypes: true });
    for (const dir of prefixDirs) {
      if (!dir.isDirectory() || dir.name.length !== 2) continue;
      const dirPath = path.join(this._basePath, dir.name);
      const entries = fs.readdirSync(dirPath);
      for (const entry of entries) {
        if (!entry.endsWith('.meta.json') && entry.length === 64) {
          results.push(entry);
        }
      }
    }

    return results;
  }
}

module.exports = BlobStore;
