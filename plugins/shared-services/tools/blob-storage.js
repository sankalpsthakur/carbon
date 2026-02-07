'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Blob Storage Module for CarbonKit
 *
 * Provides local filesystem storage with S3-compatible API structure.
 * Stores PDFs, rendered images, and other binary assets.
 *
 * Storage layout:
 *   {blobDir}/{doc_id}/original.pdf
 *   {blobDir}/{doc_id}/pages/page_1.png
 *   {blobDir}/{doc_id}/pages/page_2.png
 *   {blobDir}/{doc_id}/metadata.json
 */

class BlobStorage {
  constructor(blobDir) {
    this.blobDir = path.resolve(blobDir);
    if (!fs.existsSync(this.blobDir)) {
      fs.mkdirSync(this.blobDir, { recursive: true });
    }
  }

  /**
   * Get the directory for a specific document
   */
  _getDocDir(docId) {
    return path.join(this.blobDir, docId);
  }

  /**
   * Get the pages subdirectory for a document
   */
  _getPagesDir(docId) {
    return path.join(this._getDocDir(docId), 'pages');
  }

  /**
   * Store a PDF file
   * @param {string} docId - Document ID
   * @param {string} sourcePath - Path to source PDF
   * @returns {{ ok: boolean, blob_url: string, file_size_kb: number }}
   */
  storePDF(docId, sourcePath) {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    const docDir = this._getDocDir(docId);
    if (!fs.existsSync(docDir)) {
      fs.mkdirSync(docDir, { recursive: true });
    }

    const destPath = path.join(docDir, 'original.pdf');
    fs.copyFileSync(sourcePath, destPath);

    const stats = fs.statSync(destPath);
    const fileSizeKb = Math.round(stats.size / 1024);

    // Store metadata
    const metadata = {
      doc_id: docId,
      original_filename: path.basename(sourcePath),
      stored_at: new Date().toISOString(),
      file_size_bytes: stats.size,
      file_size_kb: fileSizeKb,
      mime_type: 'application/pdf',
      checksum: this._computeChecksum(destPath),
    };

    fs.writeFileSync(
      path.join(docDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf8'
    );

    return {
      ok: true,
      blob_url: `blob://${docId}/original.pdf`,
      file_path: destPath,
      file_size_kb: fileSizeKb,
    };
  }

  /**
   * Store a rendered page image
   * @param {string} docId - Document ID
   * @param {number} pageNumber - Page number (1-based)
   * @param {Buffer} imageBuffer - PNG image data
   * @returns {{ ok: boolean, blob_url: string }}
   */
  storePage(docId, pageNumber, imageBuffer) {
    const pagesDir = this._getPagesDir(docId);
    if (!fs.existsSync(pagesDir)) {
      fs.mkdirSync(pagesDir, { recursive: true });
    }

    const pagePath = path.join(pagesDir, `page_${pageNumber}.png`);
    fs.writeFileSync(pagePath, imageBuffer);

    return {
      ok: true,
      blob_url: `blob://${docId}/pages/page_${pageNumber}.png`,
      file_path: pagePath,
    };
  }

  /**
   * Get the filesystem path for a PDF
   * @param {string} docId - Document ID
   * @returns {string|null} - File path or null if not found
   */
  getPDFPath(docId) {
    const pdfPath = path.join(this._getDocDir(docId), 'original.pdf');
    return fs.existsSync(pdfPath) ? pdfPath : null;
  }

  /**
   * Get the filesystem path for a rendered page
   * @param {string} docId - Document ID
   * @param {number} pageNumber - Page number (1-based)
   * @returns {string|null} - File path or null if not found
   */
  getPagePath(docId, pageNumber) {
    const pagePath = path.join(this._getPagesDir(docId), `page_${pageNumber}.png`);
    return fs.existsSync(pagePath) ? pagePath : null;
  }

  /**
   * Get metadata for a stored document
   * @param {string} docId - Document ID
   * @returns {object|null} - Metadata or null if not found
   */
  getMetadata(docId) {
    const metaPath = path.join(this._getDocDir(docId), 'metadata.json');
    if (!fs.existsSync(metaPath)) return null;

    try {
      const raw = fs.readFileSync(metaPath, 'utf8');
      return JSON.parse(raw);
    } catch (_e) {
      return null;
    }
  }

  /**
   * Check if a document exists in blob storage
   * @param {string} docId - Document ID
   * @returns {boolean}
   */
  exists(docId) {
    return fs.existsSync(this._getDocDir(docId));
  }

  /**
   * Delete a document and all its associated files
   * @param {string} docId - Document ID
   * @returns {{ ok: boolean, deleted: number }}
   */
  delete(docId) {
    const docDir = this._getDocDir(docId);
    if (!fs.existsSync(docDir)) {
      return { ok: false, deleted: 0 };
    }

    // Count files before deletion
    let deleted = 0;
    const countFiles = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          countFiles(fullPath);
        } else {
          deleted++;
        }
      }
    };

    countFiles(docDir);

    // Delete directory recursively
    fs.rmSync(docDir, { recursive: true, force: true });

    return { ok: true, deleted };
  }

  /**
   * List all stored documents
   * @returns {string[]} - Array of document IDs
   */
  listDocuments() {
    if (!fs.existsSync(this.blobDir)) return [];

    const entries = fs.readdirSync(this.blobDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name);
  }

  /**
   * Get storage statistics
   * @returns {{ total_documents: number, total_size_mb: number }}
   */
  getStats() {
    const docIds = this.listDocuments();
    let totalBytes = 0;

    for (const docId of docIds) {
      const docDir = this._getDocDir(docId);
      const sizeRecursive = (dir) => {
        let size = 0;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            size += sizeRecursive(fullPath);
          } else {
            size += fs.statSync(fullPath).size;
          }
        }
        return size;
      };
      totalBytes += sizeRecursive(docDir);
    }

    return {
      total_documents: docIds.length,
      total_size_mb: +(totalBytes / (1024 * 1024)).toFixed(2),
      blob_dir: this.blobDir,
    };
  }

  /**
   * Compute SHA-256 checksum of a file
   * @private
   */
  _computeChecksum(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

/**
 * Create a blob storage instance
 * @param {string} blobDir - Base directory for blob storage
 * @returns {BlobStorage}
 */
function createBlobStorage(blobDir) {
  return new BlobStorage(blobDir);
}

module.exports = { BlobStorage, createBlobStorage };
