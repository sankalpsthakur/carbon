# 02: Completing Stubbed MCP Tools

## Overview

Workstream 2 replaces simulated/stub tool implementations with real functionality. Four tools across two MCP servers require completion, plus cross-cutting fixes to factor matching, CSV export, rate limiting, and validation.

---

## exec-mcp.js Stubs

### exec.render_page

**Current state** (lines 748-769): Returns hardcoded 612x792 metadata. No actual PDF rendering.

```javascript
// Current stub (line 768):
return toolJSON({ ok: true, render: renderRecord,
  note: 'Simulated render -- no actual image produced in local mode.' });
```

**Implementation approach**:

1. **Primary**: `pdfjs-dist` (Mozilla's PDF.js for Node) + `@napi-rs/canvas` (pure-JS Canvas)
2. **Fallback**: Shell out to `pdftoppm` (from poppler-utils) if available
3. **Minimum viable**: Return blob key pointing to rendered PNG in blob store

```
Input:  { doc_id, page_number, zoom }
Flow:
  1. Look up document metadata in store
  2. Read PDF binary from blob store (requires blob store from WS1)
  3. Render page via pdfjs-dist to canvas at specified zoom
  4. Encode canvas to PNG buffer
  5. Store rendered image in blob store -> blob_key
  6. Persist render record with { width, height, blob_key, format: 'png' }
Output: { render_id, width, height, blob_key }
```

**Local alternatives for external deps**:
- `pdfjs-dist` is pure JS, works everywhere Node runs
- `@napi-rs/canvas` uses prebuilt native binaries for major platforms
- If neither available, falls back to `pdftoppm` system binary
- If nothing available, returns metadata-only (current behavior) with `degraded: true` flag

### exec.ocr

**Current state** (lines 771-796): Returns 5 fake blocks with random confidence and placeholder text.

```javascript
// Current stub (line 784):
text: `[simulated OCR block ${i + 1} for ${doc.filename ?? docId} page ${pageNumber}]`,
confidence: +(0.85 + Math.random() * 0.14).toFixed(3),
```

**Implementation approach**:

1. **Primary**: `tesseract.js` (WASM-based OCR, no system install required)
2. **Fallback**: Shell out to `tesseract` binary if available
3. **Minimum viable**: WASM runs in any Node 18+ environment

```
Input:  { doc_id, page_number }
Flow:
  1. Look up render for this doc/page (render_page must have run first)
  2. Read rendered image from blob store
  3. Initialize tesseract.js worker with 'eng' language
  4. Run recognition on image buffer
  5. Extract blocks with bbox, confidence, text
  6. Persist blocks to ocr_blocks collection
  7. Terminate worker
Output: { doc_id, page_number, block_count, blocks: [{ block_id, text, confidence, bbox }] }
```

**Local alternatives**:
- `tesseract.js` v5 uses WASM, no system dependencies
- Language data auto-downloaded on first use (~4MB for English)
- Offline: bundle `eng.traineddata` in `shared-services/data/`
- Fallback to system `tesseract` binary with `child_process.execFileSync`

### exec.upload_pdf

**Current state** (lines 798-820): Registers metadata only. No binary file storage.

**Fix**: Accept binary content (base64 or file path), store in blob store, extract page count.

```
Input:  { filename, content_base64 OR file_path, category?, company_id?, title? }
Flow:
  1. Decode base64 or read file from path
  2. Compute SHA-256 of binary content
  3. Store binary in blob store -> blob_key
  4. Extract page count via pdfjs-dist (getDocument + numPages)
  5. Persist document record with { blob_key, sha256, page_count, size_bytes }
Output: { doc_id, blob_key, sha256, page_count, size_bytes }
```

### exec.pipeline stages

**Current state** (lines 169-200+): All 5 stages (seed, sources, ingest, seed_data, generate) complete instantly with simulated counts.

| Stage | Current Behavior | Real Implementation |
|-------|-----------------|-------------------|
| `seed` | Counts emission_factors | Seed from bundled reference data if collection is empty |
| `sources` | Counts documents | Validate all documents have blob_keys, report missing binaries |
| `ingest` | Flips ingested flag | Run render_page + ocr on un-ingested documents |
| `seed_data` | Counts benchmarks | Extract structured data from OCR blocks using pattern matching |
| `generate` | Flips recommendations flag | Generate recommendations based on maturity scores and benchmarks |

### exec.export PDF

**Current state**: Returns JSON manifest, not actual PDF.

**Fix**: Use `pdfkit` to produce actual PDF binary stored in blob store. Falls back to JSON manifest if pdfkit unavailable.

---

## strategy-mcp.js Stubs

### strategy.risk_scan

**Current state** (lines 809-958): 6 hardcoded signals with keyword substring filtering. Always returns >= 3 results.

```javascript
// Current: 6 static baseSignals (lines 817-890)
// Priority formula: 0.3*severity + 0.25*relevance + 0.2*credibility + 0.15*novelty + 0.1*actionability
```

**Implementation approach**:

```
Flow:
  1. Load risk-intelligence-baseline.json (~100 curated ESG signals covering
     CSRD/SEC Climate/ISSB/CDP/TCFD regulatory landscape)
  2. Scan all documents in store via unified DB (OCR text from exec plugin)
  3. Keyword match + TF-IDF relevance scoring against signal definitions
  4. Apply existing priority formula (unchanged)
  5. Classify: high (>=7), medium (>=5), low (<5)
  6. Merge bundled baseline signals + corpus-discovered signals
  7. Deduplicate by (channel + source_name + topic_hint)
  8. Persist scan record with full provenance
```

**New file**: `scope3-strategy/data/risk-intelligence-baseline.json` -- ~100 curated signals organized by channel (regulatory, media, ngo, academic, industry).

### strategy.snapshot.verify (NEW TOOL)

**Current state**: Not implemented. `strategy.snapshot` creates snapshots with SHA-256 hashes but there is no verification tool.

**Implementation**:

```
Input:  { snapshot_id }
Flow:
  1. Load snapshot record from snapshots collection
  2. Load current assessment, IROs, and evidence
  3. Rebuild snapshot payload (same structure as original)
  4. Compute SHA-256 of rebuilt payload
  5. Compare against stored snapshot.sha256
  6. If mismatch, identify which documents changed
Output: {
  verified: bool,
  snapshot_id,
  stored_hash,
  computed_hash,
  assessment_id,
  drift_details?: [{ collection, doc_id, change_type }]
}
```

Requires adding `strategy.snapshot.verify` to the tool definitions array (after line 338) and a handler function.

---

## Cross-Cutting Fixes

### Factor Matching Enhancement (G3)

**Current** (`calc-mcp.js` lines 250-308): `resolveMethod()` only filters by `basis` field.

**Fix**: Multi-level matching with quality tracking:
1. **Exact**: vendor + category + unit + geography
2. **Category**: category + unit
3. **Category broad**: category only
4. **Fallback**: first available factor for basis

Each match returns `match_quality` field for audit trail.

### CSV Export (G15)

**Current** (line ~589): Only quotes values containing commas.

**Fix**: RFC 4180 compliant escaping -- quote if value contains comma, double-quote, newline, or carriage return. Escape embedded quotes by doubling.

### Rate Limiting (G11)

Token bucket per tool added to exec-mcp.js:
- `exec.ocr`: 12 calls per 60 seconds
- `exec.render_page`: 12 calls per 60 seconds
- `exec.upload_pdf`: 6 calls per 60 seconds

### Bulk Operations (G14)

Add `*.db.bulkSet` tools to all 3 existing MCP servers. Delegates to `store.bulkSet()`.

### Job Status Lifecycle (G22)

Current: `calc.ingest` creates job with `status: 'DONE'` immediately.
Fix: `PENDING -> PROCESSING -> DONE | FAILED` lifecycle.

### Evidence Dedup Fix (G19)

Change dedup key from `sha256(source)` to `sha256(source + iro_id + description_first_100_chars)`.

### Configurable Materiality Threshold (G18)

Add optional `threshold` parameter to `strategy.materiality_matrix` (default 3).

### Compute Checkpoint (G21)

Write partial `inventory_items` every 100 groups during `calc.compute`. On failure, resume from last checkpoint.

---

## Dependencies

| Package | Purpose | Size |
|---------|---------|------|
| `pdfjs-dist` | PDF page rendering | ~45MB |
| `@napi-rs/canvas` | Node.js Canvas implementation | ~15MB (prebuilt) |
| `tesseract.js` | WASM-based OCR | ~4MB + language data |
| `pdfkit` | PDF generation | ~2MB |

All are optional -- each tool degrades gracefully if its dependency is missing.

## Verification

After completion, run:
```bash
node test-mcp-servers.js              # All 3 servers pass health + tool count
node plugins/scope3-execution/tools/__tests__/exec-mcp.test.js   # Render, OCR, pipeline
node plugins/scope3-strategy/tools/__tests__/strategy-mcp.test.js # Risk scan, snapshot verify
```
