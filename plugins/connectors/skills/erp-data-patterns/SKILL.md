---
name: erp-data-patterns
description: Common ERP data models for procurement data extraction from SAP MM, Oracle Procurement, and Dynamics 365 F&O.
---
Use when:
- Extracting procurement data from SAP S/4HANA, Oracle NetSuite, or Dynamics 365.
- Understanding ERP-specific field naming and data structures.
- Troubleshooting OData or REST API data extraction.

## SAP S/4HANA (MM Module)

Primary entity: `A_PurchaseOrderItem` (OData service: `API_PURCHASEORDER_PROCESS_SRV`)

Key fields:
| SAP Field | Canonical Field | Notes |
|-----------|----------------|-------|
| Supplier | vendor | 10-char vendor number; join BP master for name |
| NetPriceAmount | amount | Per-unit price in document currency |
| DocumentCurrency | currency | ISO 4217 at PO header level |
| OrderQuantity | quantity | Ordered quantity |
| PurchaseOrderQuantityUnit | unit | SAP internal unit code (ST, KG, L) |
| MaterialGroup | category | 9-char code; maps to UNSPSC via lookup |
| PurchaseOrderDate | date | PO creation date (YYYYMMDD or ISO) |
| CompanyCode | org_unit | 4-char company code |

SAP-specific considerations:
- NetPriceAmount is per-unit; total line = NetPriceAmount * OrderQuantity
- MaterialGroup is client-specific; common values in material_group_to_unspsc.json
- Plant and StorageLocation provide further granularity if needed
- Invoice data (BSEG/RBKP) may be more accurate for spend-based accounting
- SAP unit codes need mapping: ST=Each, KG=Kilogram, L=Liter, M=Meter

## Oracle NetSuite

Primary entity: `vendorBill` (REST Web Services or SuiteQL)

Key fields:
| NetSuite Field | Canonical Field | Notes |
|----------------|----------------|-------|
| vendor.companyName | vendor | Reference field display name |
| amount | amount | Line item amount |
| currency.refName | currency | ISO 4217 code |
| quantity | quantity | Line quantity |
| units.refName | unit | Unit of measure display name |
| item.refName | category | Item master display name |
| tranDate | date | Transaction date |
| subsidiary.refName | org_unit | Subsidiary display name |

NetSuite-specific considerations:
- Reference fields have .refName (display) and .value (internal ID)
- SuiteQL is often faster than REST for bulk extraction
- Multi-subsidiary requires subsidiary context in API calls
- Currency is at bill header, shared across all line items
- item.refName may be a product name rather than a category

## Dynamics 365 Finance & Operations

Primary entity: `PurchaseOrderLinesV2` (OData)

Key fields:
| D365 Field | Canonical Field | Notes |
|------------|----------------|-------|
| VendorAccountNumber | vendor | Account number; join vendor master for name |
| PurchasePrice | amount | Unit purchase price |
| CurrencyCode | currency | ISO 4217 |
| PurchaseQuantity | quantity | Ordered quantity |
| PurchaseUnitOfMeasureSymbol | unit | Unit symbol (ea, kg, lb) |
| ProcurementCategory | category | D365 procurement hierarchy |
| OrderedDate | date | Order date |
| LegalEntity | org_unit | Legal entity identifier |

D365-specific considerations:
- VendorAccountNumber needs vendor master for display name
- ProcurementCategory is a hierarchical classification (differs from UNSPSC)
- LegalEntity identifies the company; cross-company queries need $crosscompany=true
- PurchasePrice * PurchaseQuantity = line total
- Filter by OrderedDate for period-specific extraction

## Common patterns across ERPs

1. Unit price vs. line total: SAP and D365 provide per-unit price; NetSuite provides line total
2. Vendor name resolution: SAP and D365 use account numbers; NetSuite uses reference names
3. Category systems: Each ERP has its own; all need UNSPSC mapping for emission factors
4. Date formats: SAP may use YYYYMMDD; others use ISO 8601
5. Currency: Always at header/document level; line items inherit

Done criteria:
- Data extraction returns >0 rows with expected field structure.
- Vendor names resolve to readable strings (not just account numbers).
- Dates are normalized to ISO 8601.
- Category mapping produces valid UNSPSC codes where lookup tables exist.
