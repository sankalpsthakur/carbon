# 07: Connectors & Schema Mapping

## Overview

Workstream 7 builds a `connectors` plugin that transforms data from 23+ external systems (ERP, CRM, expense, accounting, travel) into CarbonKit's canonical format. Uses a classification crosswalk engine to map proprietary category codes to NAICS-6 for emission factor lookup.

---

## Architecture

```
External Data Sources                  CarbonKit
  |                                      |
  v                                      v
[Source API / File / MCP Server]    [connectors-mcp.js]
  |                                      |
  v                                      v
[Raw Source Records]                [Mapping Config (YAML)]
  |                                      |
  v                                      v
[Field Mapping]  <--  canonical_mapping section
  |
  v
[Transform Pipeline]  <--  transforms section
  |
  v
[Classification Crosswalk]
  Source codes -> UNSPSC -> NAICS-6 -> EPA EEIO factor_id
  |
  v
[Canonical Format (7 fields)]
  |
  v
[calc.ingest]  -->  activity_rows  -->  calc.compute
```

---

## Canonical Format

Every external data source maps to this intermediate format before entering `calc.ingest`:

```json
{
  "vendor": "string",
  "amount": "number",
  "currency": "string (ISO 4217)",
  "quantity": "number | null",
  "unit": "string | null",
  "category": "string (NAICS 6-digit or UNSPSC)",
  "date": "string (ISO 8601)",
  "org_unit": "string | null"
}
```

The canonical format is deliberately minimal -- 7 fields that every source can provide. Optional fields (`quantity`, `unit`, `org_unit`) enable higher-quality calculation methods when available.

---

## 10 Mapping Configs

Each YAML config maps a source system's fields to the canonical format with optional transforms.

### Config Structure

```yaml
source: string              # System identifier
display_name: string        # Human-readable name
api_type: string            # odata | rest | graphql | file | mcp
auth: string                # oauth2 | api_key | basic | none
canonical_mapping:          # Field name -> source field path
  vendor: "SourceVendorField"
  amount: "SourceAmountField"
  currency: "SourceCurrencyField"
  quantity: "SourceQuantityField"
  unit: "SourceUnitField"
  category: "SourceCategoryField"
  date: "SourceDateField"
  org_unit: "SourceOrgField"
transforms:                 # Post-mapping transformations
  date: "iso8601"           # Normalize date format
  currency: "iso4217_validate"
  category_lookup: "lookup_table_name"
  amount: "expression"      # e.g., "multiply(NetPrice, Quantity)"
pagination:
  type: string              # odata | cursor | offset | none
  page_size: number
```

### 1. sap-s4hana.yaml
- **API**: OData v4 (`API_PURCHASEORDER_PROCESS_SRV`)
- **Auth**: OAuth 2.0 (BTP)
- **Category mapping**: `MATKL` -> `material_group_to_unspsc.json` -> `unspsc_to_naics.json`
- **Amount**: `NETPR * MENGE` (unit price times quantity)

### 2. oracle-netsuite.yaml
- **API**: NetSuite REST + SuiteQL
- **Auth**: OAuth 2.0
- **Category mapping**: Procurement category -> NAICS
- **Amount**: `VendorBill.item[].amount`

### 3. dynamics-365.yaml
- **API**: Dataverse Web API (OData v4)
- **Auth**: Azure AD / Entra ID
- **Category mapping**: Custom dimension -> NAICS
- **Note**: D365 Sustainability Manager ships EPA factors

### 4. xero.yaml
- **API**: Xero Accounting API
- **Auth**: OAuth 2.0
- **Category mapping**: `AccountCode` -> GL-to-NAICS (per-client)
- **Rate limits**: 60/min, 5K/day

### 5. quickbooks.yaml
- **API**: QuickBooks REST v3
- **Auth**: OAuth 2.0
- **Category mapping**: `AccountRef` -> GL-to-NAICS (per-client)
- **Rate limits**: 500K/month

### 6. coupa.yaml
- **API**: REST (JSON/XML)
- **Auth**: OAuth 2.0
- **Category mapping**: Coupa taxonomy -> `coupa_taxonomy_to_unspsc.json` -> NAICS

### 7. concur.yaml
- **API**: REST v4
- **Auth**: OAuth 2.0 (Unified Token)
- **Category mapping**: Expense type -> NAICS category 6
- **CO2 data**: ISO 14083 (Thrust Carbon) per segment

### 8. brex-ramp.yaml
- **API**: REST (OpenAPI)
- **Auth**: OAuth 2.0 / Bearer Token
- **Category mapping**: MCC -> `mcc_to_naics.json`
- **Best for**: Card-based spend classification

### 9. generic-csv.yaml
- **API**: File (no API)
- **Auth**: None
- **Category mapping**: User-specified column -> NAICS
- **Flexible**: Column name mapping configurable per file

### 10. generic-excel.yaml
- **API**: File via excel MCP server
- **Auth**: None
- **Category mapping**: User-specified column -> NAICS
- **Note**: Uses `@negokaz/excel-mcp-server` for reading

---

## 5 Lookup Tables

### 1. unspsc_to_naics.json (~2,500 rows)
Maps UNSPSC (United Nations Standard Products and Services Code) to NAICS 6-digit. Used by SAP, Coupa, SAP Ariba.

```json
{ "unspsc": "43211500", "naics": "334111", "description": "Computer equipment" }
```

### 2. mcc_to_naics.json (~400 rows)
Maps Merchant Category Codes (credit card) to NAICS. Used by Brex, Ramp, Plaid.

```json
{ "mcc": "5812", "naics": "722511", "description": "Eating places and restaurants" }
```

### 3. material_group_to_unspsc.json (~500 rows)
Maps SAP Material Groups (MATKL) to UNSPSC codes. SAP-specific.

```json
{ "material_group": "001", "unspsc": "11101500", "description": "Crops" }
```

### 4. coupa_taxonomy_to_unspsc.json (~300 rows)
Maps Coupa procurement taxonomy to UNSPSC codes.

```json
{ "coupa_category": "IT > Hardware > Laptops", "unspsc": "43211503", "description": "Notebook computers" }
```

### 5. travel_emission_factors.json (~80 rows)
Distance-based emission factors for flights, hotels, rail, cars by mode and class.

```json
{ "mode": "flight_short_economy", "kgco2e_per_km": 0.255, "source": "DEFRA 2024" }
```

Additionally, `naics_to_eeio.json` (~1,016 rows) maps NAICS-6 to EPA EEIO emission factors, completing the crosswalk chain.

---

## MCP Server Registry

The connectors `.mcp.json` registers external MCP servers for data access:

```json
{
  "mcpServers": {
    "excel": {
      "command": "npx",
      "args": ["@negokaz/excel-mcp-server"]
    },
    "browser": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-playwright"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-filesystem", "--root", "."]
    },
    "pdf-reader": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-pdf-reader"]
    },
    "xero": {
      "command": "npx",
      "args": ["xero-mcp-server"],
      "env": { "XERO_CLIENT_ID": "", "XERO_CLIENT_SECRET": "" }
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-sequential-thinking"]
    }
  }
}
```

---

## connectors-mcp.js Tools (5)

| Tool | Input | Output |
|------|-------|--------|
| `connectors.list` | `{}` | `{ connectors: [{ source, display_name, status }] }` |
| `connectors.map` | `{ source, data }` | `{ mapped: [canonical_format] }` |
| `connectors.ingest` | `{ source, data }` | `{ job_id, row_count, warnings[] }` |
| `connectors.validate` | `{ source, data }` | `{ valid, errors[], unmapped_fields[] }` |
| `connectors.preview` | `{ source, data, limit }` | `{ preview: [canonical_format], warnings[] }` |

---

## Integration Priority

| Phase | Sources | Approach | Timeline |
|-------|---------|----------|----------|
| **Phase 1** | Excel, CSV, Google Sheets, Browser, PDF, Xero, QuickBooks | Use existing MCP servers | Gate 0 + 2 weeks |
| **Phase 2** | Concur, Coupa, Brex/Ramp, Dynamics 365 | Build custom via OpenAPI/rest-adapter.js | + 2 weeks |
| **Phase 3** | Sage, MYOB, Exact Online | Merge/Apideck unified API | + 2 weeks |
| **Phase 4** | SAP S/4HANA, Oracle Fusion, Workday | Complex enterprise connectors | + 4 weeks |

Phase 1 covers the most common data sources and requires no custom API integration -- just schema mapping configs and existing MCP servers.

---

## Classification Crosswalk Engine

```
Input Code Systems         Canonical Hub          Output
-----------------         -------------          ------
SAP Material Group  -+
Oracle Procurement  -+
UNSPSC (Coupa)      -+    +----------+   EPA EEIO factor_id
MCC (Brex/Ramp)     -+--> | NAICS-6  |-> EXIOBASE
Xero/QB Account     -+    | (1,016   |   Climatiq
D365 Custom Dim     -+    | sectors) |   DEFRA
NACE Rev.2 (EU)     -+    +----------+   ecoinvent
ISIC Rev.4 (UN)     -+
```

All classification systems funnel through NAICS-6 as the canonical hub. This enables a single set of emission factors (EPA EEIO) to cover any input source.

---

## Plugin Structure

```
connectors/
  .claude-plugin/plugin.json
  .mcp.json                            # External MCP server registry
  tools/connectors-mcp.js              # Schema mapping engine
  tools/rest-adapter.js                # Generic OpenAPI -> MCP wrapper
  agents/
    data-ingestion-orchestrator.md
    erp-connector-specialist.md
    travel-expense-analyst.md
    card-spend-classifier.md
    schema-mapper.md
  commands/
    ingest-from.md                     # /carbon:connect:ingest-from
    list-connectors.md                 # /carbon:connect:list
    map-preview.md                     # /carbon:connect:preview
    configure-source.md                # /carbon:connect:configure
  skills/
    schema-mapping/SKILL.md
    erp-data-patterns/SKILL.md
    travel-emission-methods/SKILL.md
    mcc-classification/SKILL.md
  mappings/                            # 10 YAML configs
  data/                                # 6 lookup tables
```
