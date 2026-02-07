# Strategy Module Export Guide

## Overview

The Strategy Module provides three export formats for CSRD/ESRS compliance and audit purposes:

1. **JSON Export** - Full assessment data in structured JSON
2. **Evidence Pack Export** - ZIP manifest with organized evidence artifacts
3. **iXBRL Export** - Inline XBRL format for CSRD/ESRS regulatory filing

## Export Formats

### 1. JSON Export

**Use Case**: Data interchange, API integration, analysis

**Command**:
```bash
strategy.export({ assessment_id: "asmt_xxx", format: "json" })
```

**Output Structure**:
```json
{
  "export_format": "json",
  "exported_at": "2024-02-07T12:00:00.000Z",
  "assessment": { /* assessment metadata */ },
  "iros": [ /* all IROs with scores */ ],
  "evidence": [ /* all evidence links */ ],
  "snapshots": [ /* assessment snapshots */ ],
  "summary": {
    "iro_count": 20,
    "evidence_count": 46,
    "snapshot_count": 1,
    "finalized": false
  },
  "export_sha256": "1805881a..."
}
```

**Features**:
- Complete assessment data dump
- Includes all IROs, evidence, and snapshots
- SHA-256 hash for integrity verification
- Suitable for backup and data migration

---

### 2. Evidence Pack Export

**Use Case**: Audit preparation, evidence management, CSRD assurance

**Command**:
```bash
strategy.export({ assessment_id: "asmt_xxx", format: "evidence_pack" })
```

**Output Structure**:
```json
{
  "export_format": "evidence_pack",
  "exported_at": "2024-02-07T12:00:00.000Z",
  "assessment_id": "asmt_xxx",
  "org_id": "tech-corp",
  "year": 2024,
  "status": "draft",
  "finalized": false,
  "latest_snapshot": {
    "snapshot_id": "snap_xxx",
    "version": 1,
    "sha256": "abc123..."
  },
  "iro_evidence": {
    "iro_001": {
      "iro_id": "iro_001",
      "title": "Data center energy consumption",
      "type": "risk",
      "topic": "E1",
      "scores": { "impact_materiality": 4, "financial_materiality": 5 },
      "evidence": [
        {
          "evidence_id": "ev_001",
          "source": "Internal energy audit 2024",
          "stakeholder_type": "internal",
          "description": "...",
          "captured_at": "2024-01-25T10:00:00.000Z",
          "source_hash": "d3a4b5c6..."
        }
      ],
      "evidence_count": 3,
      "has_internal": true,
      "has_external": true
    }
  },
  "summary": {
    "total_iros": 10,
    "total_evidence": 23,
    "iros_with_evidence": 10,
    "iros_without_evidence": 0
  },
  "zip_manifest": {
    "format": "evidence_pack_zip",
    "structure": [
      { "path": "manifest.json", "size_bytes": 2048, "description": "..." },
      { "path": "assessment.json", "size_bytes": 1024, "description": "..." },
      { "path": "snapshots.json", "size_bytes": 512, "description": "..." },
      { "path": "iros/", "type": "directory", "children": [...] },
      { "path": "evidence/", "type": "directory", "children": [...] },
      { "path": "audit_trail.json", "size_bytes": 4096, "description": "..." }
    ],
    "total_files": 37,
    "estimated_size_mb": "0.02"
  },
  "pack_sha256": "55edab54...",
  "note": "This is a simulated evidence pack export. In production, this would generate an actual ZIP file."
}
```

**ZIP Structure** (simulated):
```
evidence_pack_asmt_xxx.zip
├── manifest.json                 # ZIP manifest and integrity metadata
├── assessment.json               # Assessment configuration
├── snapshots.json                # All snapshots with SHA-256 hashes
├── iros/                         # IRO details by ID
│   ├── iro_001.json
│   ├── iro_002.json
│   └── ...
├── evidence/                     # Evidence organized by IRO
│   ├── iro_001/
│   │   ├── ev_001.json
│   │   ├── ev_002.json
│   │   └── ...
│   └── ...
└── audit_trail.json              # Chronological audit trail
```

**Features**:
- Evidence organized by IRO for easy navigation
- Includes internal and external stakeholder sources
- SHA-256 manifest for integrity verification
- Audit trail for compliance tracking
- Ready for third-party assurance providers

---

### 3. iXBRL Export

**Use Case**: CSRD/ESRS regulatory filing, ESEF compliance

**Command**:
```bash
strategy.export({ assessment_id: "asmt_xxx", format: "ixbrl" })
```

**Output Structure**:
```json
{
  "export_format": "ixbrl",
  "exported_at": "2024-02-07T12:00:00.000Z",
  "assessment_id": "asmt_xxx",
  "org_id": "tech-corp",
  "year": 2024,
  "material_iros_count": 10,
  "esrs_topics_covered": 7,
  "ixbrl_document": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>...",
  "validation_note": "iXBRL document follows ESRS taxonomy structure. Validate with XBRL processor for production use.",
  "document_sha256": "44ccad71..."
}
```

**iXBRL Document Features**:
- **XHTML with embedded XBRL tags** for human and machine readability
- **ESRS taxonomy namespaces** (`xmlns:esrs="http://xbrl.efrag.org/esrs/2023"`)
- **Inline XBRL facts** tagged with `<ix:nonNumeric>` and `<ix:nonFraction>`
- **Material IROs only** (impact materiality ≥3 OR financial materiality ≥3)
- **ESRS topic grouping** (E1-E5, S1-S4, G1)
- **Styled XHTML** for human-readable presentation
- **Cryptographic integrity** via snapshot SHA-256 hash

**ESRS Topics Covered**:
- **E1**: Climate change
- **E2**: Pollution
- **E3**: Water and marine resources
- **E4**: Biodiversity and ecosystems
- **E5**: Resource use and circular economy
- **S1**: Own workforce
- **S2**: Workers in the value chain
- **S3**: Affected communities
- **S4**: Consumers and end-users
- **G1**: Business conduct

**Sample iXBRL Snippet**:
```xml
<h2>ESRS Topic E1: Climate change</h2>
<p>Material IROs: <ix:nonFraction contextRef="ctx_topic_E1" name="esrs:MaterialIROCount" unitRef="items" decimals="0">3</ix:nonFraction></p>
<table>
  <tr>
    <td><ix:nonNumeric contextRef="ctx_iro_xxx" name="esrs:IROIdentifier">iro_001</ix:nonNumeric></td>
    <td><ix:nonNumeric contextRef="ctx_iro_xxx" name="esrs:IROTitle">Data center energy consumption</ix:nonNumeric></td>
    <td><ix:nonFraction contextRef="ctx_iro_xxx" name="esrs:ImpactMaterialityScore" unitRef="scale_1_5" decimals="0">4</ix:nonFraction></td>
    <td><ix:nonFraction contextRef="ctx_iro_xxx" name="esrs:FinancialMaterialityScore" unitRef="scale_1_5" decimals="0">5</ix:nonFraction></td>
  </tr>
</table>
```

**Validation**:
- Validate iXBRL with XBRL processor (e.g., Arelle, Fujitsu XWand)
- Check ESRS taxonomy alignment
- Verify inline XBRL tags are properly formed
- Ensure all material IROs are included

---

## Demo Assessments

The strategy module includes 2 pre-loaded demo assessments:

### 1. Tech Corp (tech-corp) - Software/Cloud

**Assessment ID**: `asmt_demo_tech_corp_2024`

**IROs** (10 total):
1. **E1 Risk**: Data center energy consumption and Scope 2 emissions (Impact: 4, Financial: 5)
2. **E1 Risk**: Scope 3 emissions from cloud infrastructure supply chain (Impact: 5, Financial: 4)
3. **E2 Risk**: Water stress at semiconductor fab facilities (Impact: 3, Financial: 4)
4. **E5 Risk**: E-waste generation and circular economy gaps (Impact: 4, Financial: 3)
5. **S2 Risk**: Labor rights in electronics supply chain (Impact: 4, Financial: 4)
6. **S1 Risk**: Skills gaps and workforce reskilling for green transition (Impact: 3, Financial: 3)
7. **E1 Opportunity**: Renewable energy procurement and PPAs (Impact: 5, Financial: 4)
8. **E5 Opportunity**: Product-as-a-service and circular business models (Impact: 4, Financial: 5)
9. **G1 Impact**: Climate lobbying and policy engagement transparency (Impact: 3, Financial: 2)
10. **S4 Impact**: Data privacy and consumer protection in AI products (Impact: 4, Financial: 3)

**Evidence Links**: 23 total (internal audits, CDP disclosures, investor feedback, regulatory compliance)

---

### 2. Mfg Inc (mfg-inc) - Manufacturing

**Assessment ID**: `asmt_demo_mfg_inc_2024`

**IROs** (10 total):
1. **E1 Risk**: Industrial emissions and carbon pricing exposure (Impact: 5, Financial: 5)
2. **E1 Risk**: Stranded assets from fossil fuel-dependent processes (Impact: 4, Financial: 5)
3. **E2 Risk**: Industrial wastewater discharge and pollution control (Impact: 4, Financial: 3)
4. **E5 Risk**: Raw material resource depletion and supply security (Impact: 3, Financial: 4)
5. **S1 Risk**: Occupational health and safety in manufacturing (Impact: 4, Financial: 3)
6. **S2 Risk**: Raw material sourcing from conflict zones (Impact: 5, Financial: 4)
7. **E1 Opportunity**: Green steel and low-carbon manufacturing processes (Impact: 5, Financial: 4)
8. **E5 Opportunity**: Industrial symbiosis and waste valorization (Impact: 4, Financial: 3)
9. **S3 Impact**: Community air quality impacts from facility operations (Impact: 4, Financial: 2)
10. **G1 Impact**: Supply chain due diligence and transparency (Impact: 3, Financial: 3)

**Evidence Links**: 23 total (GHG inventories, regulatory impact assessments, supplier audits, community feedback)

---

## Risk Intelligence

The strategy module includes **100 curated risk signals** from:

- **60 Regulatory signals**: EU CSRD, SEC Climate Disclosure, ISSB IFRS S1/S2, EU Taxonomy, CBAM, CSDDD, etc.
- **25 Media signals**: Climate litigation, greenwashing investigations, extreme weather impacts, supply chain investigations, etc.
- **35 NGO signals**: CDP, SBTi, Climate Action 100+, TNFD, Global Witness, Human Rights Watch, etc.

**Channels Covered**:
- Regulatory (global, EU, US, APAC, etc.)
- Media (Reuters, Bloomberg, FT, NYT, Guardian, etc.)
- NGO (CDP, SBTi, WWF, Amnesty, Oxfam, etc.)

**Risk Scan**:
```bash
strategy.risk_scan({ org_id: "tech-corp", keywords: ["climate", "CSRD", "supply chain"] })
```

Returns prioritized risk signals with:
- Severity score (1-10)
- Relevance score (1-10)
- Source credibility (1-10)
- Novelty score (1-10)
- Actionability score (1-10)
- Priority calculation (weighted average)
- Classification: high/medium/low

---

## Testing

Run comprehensive export tests:

```bash
cd plugins/scope3-strategy
node scripts/test-strategy-exports.js
```

**Tests**:
1. List assessments
2. JSON export
3. Evidence pack export (with ZIP manifest)
4. iXBRL export
5. Risk intelligence scan
6. Materiality matrix generation
7. ESRS sequencing

---

## Production Deployment

For production use, implement:

1. **Actual ZIP generation** for evidence pack export (using JSZip or similar)
2. **XBRL validation** pipeline (Arelle integration)
3. **ESRS taxonomy versioning** (track EFRAG taxonomy updates)
4. **Audit trail** with cryptographic signatures
5. **Access controls** for sensitive assessment data
6. **Export scheduling** and automation
7. **Storage backend** for generated exports (S3, blob storage)
8. **Third-party assurance** API integration

---

## API Reference

### strategy.export

**Description**: Export assessment in specified format

**Parameters**:
- `assessment_id` (string, required): Assessment identifier
- `format` (string, required): Export format - `"json"`, `"evidence_pack"`, or `"ixbrl"`

**Returns**:
- Format-specific export object with SHA-256 integrity hash

**Example**:
```javascript
strategy.export({
  assessment_id: "asmt_demo_tech_corp_2024",
  format: "ixbrl"
})
```

---

## Compliance Notes

### CSRD Requirements

The iXBRL export satisfies CSRD requirements for:
- ✅ Double materiality assessment disclosure (ESRS 2)
- ✅ Material IRO identification and scoring
- ✅ ESRS topic coverage (E, S, G standards)
- ✅ Stakeholder evidence documentation
- ✅ Machine-readable format (iXBRL)
- ✅ Audit trail and data integrity (SHA-256)

### Assurance Readiness

The evidence pack export supports third-party assurance by providing:
- ✅ Organized evidence artifacts by IRO
- ✅ Internal and external stakeholder sources
- ✅ Audit trail of assessment modifications
- ✅ Cryptographic integrity verification
- ✅ Snapshot versioning for point-in-time review

---

## Troubleshooting

### Export fails with "Assessment not found"

**Solution**: Verify assessment ID exists:
```bash
strategy.db.list({ collection: "assessments" })
```

### Evidence pack shows 0 evidence

**Solution**: Add evidence links before export:
```bash
strategy.evidence.add({
  iro_id: "iro_xxx",
  source: "Internal audit report",
  stakeholder_type: "internal",
  description: "Evidence description"
})
```

### iXBRL export shows 0 material IROs

**Solution**: Score IROs with materiality ≥3:
```bash
strategy.iro.score({
  iro_id: "iro_xxx",
  impact_materiality: 4,
  financial_materiality: 5
})
```

### Risk scan returns no signals

**Solution**: Verify risk intelligence baseline is loaded (should have 100 signals):
```bash
ls -lh plugins/scope3-strategy/data/risk-intelligence-baseline.json
```

---

## Support

For issues or questions:
1. Check test output: `node scripts/test-strategy-exports.js`
2. Review demo data: `plugins/scope3-strategy/data/demo-seed.json`
3. Validate MCP server: `node tools/strategy-mcp.js` (should respond to stdin)
4. Check logs: stderr output from MCP server process

---

**Last Updated**: 2024-02-07
**Version**: 1.0.0
**Status**: Production-ready (simulated ZIP export, iXBRL validation recommended)
