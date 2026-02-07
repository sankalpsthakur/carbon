'use strict';

/**
 * Unified store adapter for CarbonKit MCP servers.
 *
 * Factory: createStore({ backend, dataDir, serverName, connectionString })
 *          createBlobStore({ basePath })
 *
 * Normalizes all timestamps to _created_at / _updated_at.
 * Includes SHA-256 audit logging on every write.
 *
 * Supported backends: 'file' (default), 'sqlite'.
 */

const FileBackend = require('./backends/file-store');

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a store instance.
 *
 * @param {{ backend?: string, dataDir: string, serverName?: string, connectionString?: string, poolMax?: number }} opts
 * @returns {FileBackend|import('./backends/sqlite-store')|import('./backends/postgres-store')}
 */
function createStore(opts) {
  if (!opts || !opts.dataDir) {
    throw new Error('createStore requires opts.dataDir');
  }
  const backend = opts.backend || process.env.CARBONKIT_DB_BACKEND || 'file';

  switch (backend) {
    case 'file':
      return new FileBackend(opts.dataDir, opts.serverName);

    case 'sqlite': {
      const SqliteBackend = require('./backends/sqlite-store');
      return new SqliteBackend(opts.dataDir, opts.serverName);
    }

    case 'postgres':
      throw new Error('Postgres backend is not supported in the current Carbon SDK layer. Use sqlite or file.');

    default:
      throw new Error(`Unsupported backend: ${backend}`);
  }
}

/**
 * Create a blob store instance for binary file storage.
 *
 * @param {{ basePath: string }} opts
 * @returns {import('./backends/blob-store')}
 */
function createBlobStore(opts) {
  const BlobStore = require('./backends/blob-store');
  return new BlobStore(opts);
}

module.exports = { createStore, createBlobStore, FileBackend };
