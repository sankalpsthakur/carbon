# Execution Module Frontend Quickstart

## Installation

```bash
cd plugins
npm install  # Installs pdfjs-dist, @napi-rs/canvas, tesseract.js, pdf-parse
```

## Starting the MCP Server

```bash
# From plugins directory
node scope3-execution/tools/exec-mcp.js
```

The server listens on stdio with MCP (Model Context Protocol) framing.

## Tool Reference

### 1. Upload PDF

```javascript
// Upload a PDF from filesystem
{
  "tool": "exec.upload_pdf",
  "args": {
    "file_path": "/path/to/report.pdf",
    "title": "Q1 2025 Sustainability Report",
    "company_id": "sup-acme-logistics",
    "category": "sustainability_report"  // or: cdp_response, esg_report, ghg_inventory
  }
}

// Returns:
{
  "ok": true,
  "doc_id": "16447051-6238-4e27-8bc4-a7a9c99b6d7c",
  "blob_url": "blob://16447051.../original.pdf",
  "page_count": 42,
  "file_size_kb": 2341,
  "doc": { /* full document record */ }
}
```

### 2. Render PDF Page

```javascript
// Render a specific page as PNG
{
  "tool": "exec.render_page",
  "args": {
    "doc_id": "16447051-6238-4e27-8bc4-a7a9c99b6d7c",
    "page_number": 1,  // 1-based
    "zoom": 1.5         // optional, default 1.0
  }
}

// Returns:
{
  "ok": true,
  "render": {
    "width": 918,      // ACTUAL width (zoom * 612)
    "height": 1188,    // ACTUAL height (zoom * 792)
    "blob_url": "blob://.../pages/page_1.png",
    "image_path": "/full/path/to/page_1.png",
    "render_method": "pdfjs-dist",
    "rendered_at": "2026-02-07T12:00:00Z"
  }
}
```

### 3. OCR Page

```javascript
// Extract text from rendered page
{
  "tool": "exec.ocr",
  "args": {
    "doc_id": "16447051-6238-4e27-8bc4-a7a9c99b6d7c",
    "page_number": 1
  }
}

// Returns:
{
  "doc_id": "16447051...",
  "page_number": 1,
  "ocr_method": "tesseract.js",  // or: tesseract-binary, simulated
  "block_count": 24,
  "blocks": [
    {
      "block_id": "16447051..._p1_b0",
      "text": "Scope 3 Emissions Total",
      "confidence": 0.923,
      "bbox": [50, 150, 380, 180]  // [x0, y0, x1, y1]
    },
    // ... more blocks
  ]
}
```

### 4. Save Provenance

```javascript
// Link OCR blocks to data fields
{
  "tool": "exec.provenance.save",
  "args": {
    "entity_type": "supplier",
    "entity_id": "sup-acme-logistics",
    "field_key": "scope3_emissions",
    "doc_id": "16447051-6238-4e27-8bc4-a7a9c99b6d7c",
    "page_number": 1,
    "ocr_block_ids": ["16447051..._p1_b3", "16447051..._p1_b4"],
    "value": "12345",
    "unit": "tCO2e"
  }
}

// Returns:
{
  "ok": true,
  "provenance": {
    "_id": "...",
    "entity_type": "supplier",
    "entity_id": "sup-acme-logistics",
    "field_key": "scope3_emissions",
    "ocr_confidence_min": 0.891,
    "created_at": "2026-02-07T12:00:00Z"
  }
}
```

### 5. List Suppliers

```javascript
// Get suppliers with optional filters
{
  "tool": "exec.suppliers.list",
  "args": {
    "category": "logistics",      // optional
    "rating": "B",                 // optional: A, B, C, D, E
    "min_impact": 10.0            // optional: minimum upstream_impact_pct
  }
}

// Returns:
{
  "count": 5,
  "suppliers": [
    {
      "_id": "sup-acme-logistics",
      "name": "Acme Logistics",
      "category": "logistics",
      "cee_rating": "B",
      "upstream_impact_pct": 12.5,
      "evidence_status": "ok",
      "country": "USA",
      "annual_spend_usd": 2500000
    },
    // ... more suppliers
  ]
}
```

### 6. Supplier Heatmap

```javascript
// Get category × rating matrix
{
  "tool": "exec.suppliers.heatmap",
  "args": {}
}

// Returns:
{
  "total_suppliers": 20,
  "heatmap": {
    "logistics": { "A": 1, "B": 2, "C": 2 },
    "manufacturing": { "A": 2, "B": 1, "D": 2, "E": 2 },
    "energy": { "A": 3, "E": 1 },
    "technology": { "B": 3 }
  }
}
```

### 7. Maturity Score

```javascript
// Compute M0-M4 maturity level
{
  "tool": "exec.maturity_score",
  "args": {
    "supplier_id": "sup-acme-logistics"
  }
}

// Returns:
{
  "supplier_id": "sup-acme-logistics",
  "supplier_name": "Acme Logistics",
  "level": "M4_commitment_recorded",
  "score": 100,
  "evidence_count": 3,
  "engagement_status": "completed",
  "computed_at": "2026-02-07T12:00:00Z"
}
```

### 8. Update Engagement

```javascript
// Update supplier engagement status
{
  "tool": "exec.engagement.update",
  "args": {
    "supplier_id": "sup-acme-logistics",
    "status": "in_progress"  // not_started, in_progress, pending_response, completed, on_hold
  }
}

// Returns:
{
  "ok": true,
  "engagement": {
    "_id": "...",
    "supplier_id": "sup-acme-logistics",
    "status": "in_progress",
    "updated_at": "2026-02-07T12:00:00Z"
  }
}
```

### 9. Quality Gates

```javascript
// Check data quality
{
  "tool": "exec.quality_gates",
  "args": {
    "run_id": "latest"  // optional
  }
}

// Returns:
{
  "run_id": "latest",
  "overall": "pass",  // or: fail
  "gates": [
    { "gate": "suppliers_exist", "pass": true, "detail": { "count": 20 } },
    { "gate": "emission_factors_loaded", "pass": true, "detail": { "count": 156 } },
    { "gate": "documents_ingested", "pass": true, "detail": { "pending": 0, "total": 6 } }
  ],
  "checked_at": "2026-02-07T12:00:00Z"
}
```

### 10. Export CSRD

```javascript
// Export CSRD E1-6 structure
{
  "tool": "exec.export",
  "args": {
    "format": "csrd",
    "period": "2025"
  }
}

// Returns:
{
  "format": "csrd",
  "framework": "CSRD/ESRS",
  "sections": {
    "E1_climate_change": {
      "description": "Climate change mitigation and adaptation",
      "emission_records": 42,
      "scope1_tco2e": 1234.5,
      "scope2_tco2e": 5678.9,
      "scope3_tco2e": 12345.6
    },
    "S2_value_chain_workers": {
      "supplier_count": 20,
      "total_annual_spend_usd": 87400000,
      "supplier_ratings": { "A": 5, "B": 5, "C": 3, "D": 4, "E": 3 }
    },
    "G1_governance": {
      "provenance_records": 18,
      "verified_suppliers": 12
    }
  }
}
```

### 11. Export GHG Protocol

```javascript
// Export GHG Protocol breakdown
{
  "tool": "exec.export",
  "args": {
    "format": "ghg",
    "period": "2025"
  }
}

// Returns:
{
  "format": "ghg",
  "framework": "GHG Protocol",
  "scopes": {
    "scope1": { "records": 8, "total_tco2e": 1234.56 },
    "scope2": { "records": 12, "total_tco2e": 5678.90 },
    "scope3": {
      "records": 22,
      "total_tco2e": 12345.67,
      "categories": {
        "category_1": { "records": 10, "total_tco2e": 8234.12 },
        "category_4": { "records": 12, "total_tco2e": 4111.55 }
      }
    }
  },
  "summary": {
    "total_emissions_tco2e": 19259.13,
    "data_quality_score": 0.892
  }
}
```

### 12. Run Pipeline

```javascript
// Run full 5-stage pipeline
{
  "tool": "exec.pipeline.run",
  "args": {
    "period": "2025"
  }
}

// Returns:
{
  "run_id": "run_2025_1738936800000",
  "period": "2025",
  "stages": [
    { "run_id": "...", "stage": "seed", "status": "completed", "detail": "..." },
    { "run_id": "...", "stage": "sources", "status": "completed", "detail": "..." },
    { "run_id": "...", "stage": "ingest", "status": "completed", "detail": "..." },
    { "run_id": "...", "stage": "seed_data", "status": "completed", "detail": "..." },
    { "run_id": "...", "stage": "generate", "status": "completed", "detail": "..." }
  ],
  "message": "Pipeline run complete"
}
```

## Data Access (Direct DB)

All data is stored as JSON files in `/scope3-execution/data/`:

- `suppliers.json` - 20 demo suppliers
- `engagements.json` - 16 demo engagements
- `documents.json` - 6 demo documents
- `renders.json` - Rendered page metadata
- `ocr_blocks.json` - OCR text blocks
- `provenance.json` - Evidence chain links
- `emissions.json` - Emission records (if any)
- `blobs/` - Binary storage (PDFs, PNGs)

## Demo Data

Run the seeder to populate demo data:

```bash
node scope3-execution/tools/seed-demo-data.js
```

This creates:
- 20 suppliers across 5 categories (logistics, manufacturing, energy, technology, construction)
- CEE ratings: A (5), B (5), C (3), D (4), E (3)
- 15 engagements with varied statuses
- 5 sample documents (metadata only - no actual PDFs)

## UI Component Ideas

### 1. Supplier Dashboard
- Heatmap visualization (category × rating)
- Filter by category, rating, upstream impact
- Click to view maturity score + evidence

### 2. Document Viewer
- Upload PDF → renders to pages
- Navigate pages with thumbnails
- OCR overlay on hover
- Click text block → link to data field

### 3. Evidence Chain
- Visual provenance graph
- Doc → Page → OCR Block → Data Field
- Confidence scores as color-coded badges
- Click to view source document page

### 4. Quality Dashboard
- Quality gate status indicators
- Maturity score distribution chart
- Data quality score timeline
- Export buttons (CSRD, GHG, PDF)

### 5. Engagement Tracker
- Kanban board of supplier engagements
- Status: not_started → in_progress → pending_response → completed
- Drag-and-drop to update status
- Click to view supplier details

## Performance Tips

1. **Cache Rendered Pages**: Call `exec.render_page` once, store blob_url in state
2. **Batch OCR**: Run OCR on-demand (user clicks page), not automatically for all pages
3. **Lazy Load Suppliers**: Use `limit` parameter if >100 suppliers
4. **Debounce Filters**: Wait 300ms after user stops typing before re-filtering
5. **Prefetch Next Page**: Render page N+1 while user views page N

## Error Handling

All tools return `{ ok: true/false }` or `{ isError: true }`:

```javascript
const result = await callTool('exec.render_page', { doc_id, page_number: 1 });
if (result.isError) {
  console.error('Render failed:', result.content[0].text);
  // Handle error: show toast, retry button, etc.
}
```

Common errors:
- `Document not found` - Invalid doc_id
- `PDF file not found` - Document not uploaded yet
- `No rendered image found` - Call `render_page` before `ocr`
- `Page N out of range` - Page number exceeds page_count

## Next Steps

1. Read `/scope3-execution/EXECUTION_MODULE_IMPLEMENTATION.md` for full technical details
2. Run test suite: `node scope3-execution/tools/test-exec-module.js`
3. Explore demo data: `cat scope3-execution/data/suppliers.json | jq`
4. Start MCP server and test tools via Claude Code or MCP Inspector
5. Build UI components using the tool reference above
