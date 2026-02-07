'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { createStore, createBlobStore } = require('../store-adapter');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `carbonkit-test-${prefix}-`));
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ===========================================================================
// File Backend Tests
// ===========================================================================

describe('FileBackend', () => {
  let tmpDir;
  let store;

  before(() => {
    tmpDir = makeTmpDir('file');
    store = createStore({ backend: 'file', dataDir: tmpDir, serverName: 'test-server' });
  });

  after(() => {
    store.close();
    cleanDir(tmpDir);
  });

  beforeEach(() => {
    // Clean collections between tests
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.json') && f !== '_audit_log.json');
    for (const f of files) fs.unlinkSync(path.join(tmpDir, f));
  });

  describe('set and get', () => {
    it('should insert a new document with auto-generated _id', () => {
      const doc = store.set('items', { name: 'widget', price: 10 });
      assert.ok(doc._id, 'should have _id');
      assert.ok(doc._created_at, 'should have _created_at');
      assert.ok(doc._updated_at, 'should have _updated_at');
      assert.equal(doc.name, 'widget');
      assert.equal(doc.price, 10);
    });

    it('should retrieve a document by _id', () => {
      const doc = store.set('items', { name: 'gadget' });
      const found = store.get('items', { _id: doc._id });
      assert.ok(found);
      assert.equal(found.name, 'gadget');
      assert.equal(found._id, doc._id);
    });

    it('should return null for non-existent document', () => {
      const found = store.get('items', { _id: 'nonexistent' });
      assert.equal(found, null);
    });

    it('should update existing document by _id (upsert)', () => {
      const doc = store.set('items', { name: 'old' });
      const updated = store.set('items', { _id: doc._id, name: 'new', extra: true });
      assert.equal(updated.name, 'new');
      assert.equal(updated.extra, true);
      assert.equal(updated._created_at, doc._created_at, '_created_at should not change');
    });

    it('should preserve _created_at on update', () => {
      const doc = store.set('items', { name: 'first' });
      const originalCreated = doc._created_at;

      // Small delay to ensure timestamps differ
      const updated = store.set('items', { _id: doc._id, name: 'second' });
      assert.equal(updated._created_at, originalCreated);
    });
  });

  describe('list', () => {
    it('should list all documents in a collection', () => {
      store.set('fruits', { name: 'apple' });
      store.set('fruits', { name: 'banana' });
      store.set('fruits', { name: 'cherry' });

      const all = store.list('fruits');
      assert.equal(all.length, 3);
    });

    it('should filter by query', () => {
      store.set('fruits', { name: 'apple', color: 'red' });
      store.set('fruits', { name: 'banana', color: 'yellow' });
      store.set('fruits', { name: 'cherry', color: 'red' });

      const reds = store.list('fruits', { color: 'red' });
      assert.equal(reds.length, 2);
      assert.ok(reds.every((f) => f.color === 'red'));
    });

    it('should respect limit parameter', () => {
      store.set('nums', { val: 1 });
      store.set('nums', { val: 2 });
      store.set('nums', { val: 3 });

      const limited = store.list('nums', {}, 2);
      assert.equal(limited.length, 2);
    });

    it('should return empty array for nonexistent collection', () => {
      const result = store.list('nonexistent');
      assert.deepEqual(result, []);
    });
  });

  describe('delete', () => {
    it('should delete matching documents', () => {
      store.set('items', { name: 'a', group: 'x' });
      store.set('items', { name: 'b', group: 'y' });
      store.set('items', { name: 'c', group: 'x' });

      const result = store.delete('items', { group: 'x' });
      assert.equal(result.removed, 2);

      const remaining = store.list('items');
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].name, 'b');
    });

    it('should throw on empty query (safety guard)', () => {
      assert.throws(
        () => store.delete('items', {}),
        /non-empty object/
      );
    });

    it('should throw on missing query', () => {
      assert.throws(
        () => store.delete('items', null),
        /non-empty object/
      );
    });

    it('should return removed: 0 when nothing matches', () => {
      store.set('items', { name: 'z' });
      const result = store.delete('items', { name: 'nonexistent' });
      assert.equal(result.removed, 0);
    });
  });

  describe('bulkSet', () => {
    it('should insert multiple documents', () => {
      const docs = store.bulkSet('bulk', [
        { name: 'one' },
        { name: 'two' },
        { name: 'three' },
      ]);
      assert.equal(docs.length, 3);
      assert.ok(docs.every((d) => d._id && d._created_at));

      const all = store.list('bulk');
      assert.equal(all.length, 3);
    });

    it('should update existing documents by _id', () => {
      const first = store.set('bulk2', { name: 'original' });
      const docs = store.bulkSet('bulk2', [
        { _id: first._id, name: 'updated' },
        { name: 'new' },
      ]);
      assert.equal(docs.length, 2);

      const found = store.get('bulk2', { _id: first._id });
      assert.equal(found.name, 'updated');
    });

    it('should throw on non-array input', () => {
      assert.throws(
        () => store.bulkSet('bulk', 'not an array'),
        /must be an array/
      );
    });
  });

  describe('count', () => {
    it('should count all documents', () => {
      store.set('counting', { x: 1 });
      store.set('counting', { x: 2 });
      assert.equal(store.count('counting'), 2);
    });

    it('should count with query filter', () => {
      store.set('counting2', { type: 'a' });
      store.set('counting2', { type: 'b' });
      store.set('counting2', { type: 'a' });
      assert.equal(store.count('counting2', { type: 'a' }), 2);
    });
  });

  describe('audit log', () => {
    it('should write audit log entries on set', () => {
      store.set('audited', { name: 'test' });
      const logPath = path.join(tmpDir, '_audit_log.json');
      assert.ok(fs.existsSync(logPath), 'audit log should exist');

      const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      assert.ok(log.length > 0, 'audit log should have entries');

      const last = log[log.length - 1];
      assert.equal(last.server, 'test-server');
      assert.equal(last.collection, 'audited');
      assert.equal(last.operation, 'set');
      assert.ok(last.sha256, 'should have sha256 hash');
      assert.ok(last.timestamp, 'should have timestamp');
    });

    it('should write audit log entries on delete', () => {
      store.set('audited2', { name: 'deleteme', tag: 'del' });
      store.delete('audited2', { tag: 'del' });

      const logPath = path.join(tmpDir, '_audit_log.json');
      const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      const deleteEntries = log.filter((e) => e.operation === 'delete');
      assert.ok(deleteEntries.length > 0, 'should have delete audit entries');
    });
  });
});

// ===========================================================================
// BlobStore Tests
// ===========================================================================

describe('BlobStore', () => {
  let tmpDir;
  let blobs;

  before(() => {
    tmpDir = makeTmpDir('blob');
    blobs = createBlobStore({ basePath: tmpDir });
  });

  after(() => {
    cleanDir(tmpDir);
  });

  describe('put and get', () => {
    it('should store and retrieve a buffer', () => {
      const content = Buffer.from('Hello, CarbonKit!');
      const result = blobs.put('test-file.txt', content, { content_type: 'text/plain' });

      assert.ok(result.sha256, 'should return sha256');
      assert.equal(result.size, content.length);
      assert.equal(result.key, 'test-file.txt');

      const retrieved = blobs.get(result.sha256);
      assert.ok(retrieved, 'should retrieve the blob');
      assert.ok(Buffer.compare(retrieved.buffer, content) === 0, 'content should match');
      assert.equal(retrieved.metadata.content_type, 'text/plain');
      assert.equal(retrieved.metadata.key, 'test-file.txt');
    });

    it('should return null for non-existent blob', () => {
      const result = blobs.get('0000000000000000000000000000000000000000000000000000000000000000');
      assert.equal(result, null);
    });

    it('should throw on non-Buffer input', () => {
      assert.throws(
        () => blobs.put('bad', 'not a buffer'),
        /must be a Buffer/
      );
    });

    it('should be content-addressed (same content = same hash)', () => {
      const content = Buffer.from('identical content');
      const r1 = blobs.put('file-a', content);
      const r2 = blobs.put('file-b', content);
      assert.equal(r1.sha256, r2.sha256, 'same content should produce same hash');
    });
  });

  describe('exists', () => {
    it('should return true for stored blob', () => {
      const result = blobs.put('exists-test', Buffer.from('data'));
      assert.ok(blobs.exists(result.sha256));
    });

    it('should return false for non-existent blob', () => {
      assert.ok(!blobs.exists('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
    });
  });

  describe('delete', () => {
    it('should delete a stored blob', () => {
      const result = blobs.put('delete-me', Buffer.from('temp data'));
      assert.ok(blobs.exists(result.sha256));

      const deleted = blobs.delete(result.sha256);
      assert.ok(deleted);
      assert.ok(!blobs.exists(result.sha256));
    });

    it('should return false for non-existent blob', () => {
      const deleted = blobs.delete('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
      assert.ok(!deleted);
    });
  });

  describe('list', () => {
    it('should list all stored blobs', () => {
      // Store a few distinct blobs
      blobs.put('list-1', Buffer.from('content-1-' + Date.now()));
      blobs.put('list-2', Buffer.from('content-2-' + Date.now()));

      const all = blobs.list();
      assert.ok(all.length >= 2, 'should list at least 2 blobs');
      assert.ok(all.every((h) => h.length === 64), 'all entries should be sha256 hashes');
    });
  });
});

// ===========================================================================
// Store factory tests
// ===========================================================================

describe('createStore factory', () => {
  it('should create file backend by default', () => {
    const tmpDir = makeTmpDir('factory');
    const store = createStore({ dataDir: tmpDir });
    store.set('test', { val: 1 });
    assert.equal(store.get('test', { val: 1 }).val, 1);
    store.close();
    cleanDir(tmpDir);
  });

  it('should throw on missing dataDir', () => {
    assert.throws(
      () => createStore({}),
      /requires opts\.dataDir/
    );
  });

  it('should throw on unsupported backend', () => {
    assert.throws(
      () => createStore({ dataDir: '/tmp', backend: 'redis' }),
      /Unsupported backend/
    );
  });
});
