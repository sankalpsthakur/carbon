# 09: ERP/CRM/SaaS Integration Research

## Overview

Research summary for 23 systems that CarbonKit can ingest carbon-relevant data from. For each system: data format, auth pattern, key fields for carbon accounting, MCP server availability, and build priority.

---

## 1. SAP S/4HANA

| Attribute | Detail |
|-----------|--------|
| **Data format** | OData v4 (JSON), IDoc (XML), BAPI (RFC) |
| **Auth pattern** | OAuth 2.0 via SAP BTP; X.509 certificate for on-prem |
| **Key fields** | `EKPO.NETPR` (price), `EKPO.MENGE` (qty), `EKPO.MATKL` (material group), `EKKO.LIFNR` (vendor), `EKKO.WAERS` (currency), `LFA1.NAME1` (vendor name), `EKKN.SAKTO` (GL code) |
| **Carbon-specific** | SAP Sustainability Footprint Management: product carbon footprints via `SFM Item Footprints API`. PACT V2 compliant. |
| **MCP server** | None available. Build custom via OData adapter. |
| **Build priority** | **Phase 4** -- complex enterprise connector, requires BTP tenant |

## 2. Oracle NetSuite

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (JSON), SuiteQL (SQL over REST) |
| **Auth pattern** | OAuth 2.0 (Token-Based Authentication) |
| **Key fields** | `VendorBill.item[].amount`, `Vendor.companyName`, `VendorBill.item[].category`, `VendorBill.currencyCode`, `PurchaseOrder.item[].quantity`, `PurchaseOrder.item[].units` |
| **Carbon-specific** | No native carbon features. GL-based category mapping required. |
| **MCP server** | None available. Build via SuiteQL + REST. |
| **Build priority** | **Phase 4** -- enterprise, but simpler API than SAP |

## 3. Oracle Fusion

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (JSON) via `/fscmRestApi` |
| **Auth pattern** | OAuth 2.0 |
| **Key fields** | `PO.lines[].UnitPrice`, `PO.Quantity`, `PO.SupplierId`, `PO.lines[].CategoryId`, `PO.CurrencyCode` |
| **Carbon-specific** | Oracle Sustainability Ledger auto-calculates emissions from transaction data. Can export calculated values. |
| **MCP server** | None available. |
| **Build priority** | **Phase 4** -- complex enterprise |

## 4. Microsoft Dynamics 365

| Attribute | Detail |
|-----------|--------|
| **Data format** | Dataverse Web API (OData v4, JSON) |
| **Auth pattern** | Azure AD / Entra ID OAuth 2.0 |
| **Key fields** | `msdyn_PurchasedGoodsActivities.spendamount`, `msdyn_*.quantity`, `msdyn_*.unit`, `msdyn_*.customdimension`, `EmissionFactor.co2evalue`, `Emission.co2e` |
| **Carbon-specific** | D365 Sustainability Manager ships EPA 2025 emission factors. Can seed CarbonKit's factor database. |
| **MCP server** | None available. Build via Dataverse API. |
| **Build priority** | **Phase 2** -- good API, ships emission factors |

## 5. Sage Intacct

| Attribute | Detail |
|-----------|--------|
| **Data format** | XML-based Web Services API, REST API (newer) |
| **Auth pattern** | Session-based (Web Services), OAuth 2.0 (REST) |
| **Key fields** | `APBill.LineItems[].Amount`, `Vendor.Name`, `APBill.CurrencyCode`, `GLAccount.AccountNo`, `Department`, `Location` |
| **Carbon-specific** | No native carbon features. Dimension-based categorization. |
| **MCP server** | None available. |
| **Build priority** | **Phase 3** -- via Merge/Apideck unified API |

## 6. Infor (CloudSuite)

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (JSON), ION API |
| **Auth pattern** | OAuth 2.0 via Infor OS |
| **Key fields** | `PurchaseOrder.lines[].amount`, `Supplier.name`, `CommodityCode`, `CurrencyCode` |
| **Carbon-specific** | Infor Sustainability Science integrates with CloudSuite. Provides pre-calculated product footprints. |
| **MCP server** | None available. |
| **Build priority** | **Phase 4** -- niche enterprise |

## 7. Salesforce Net Zero Cloud

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST API (JSON), SOQL, Bulk API 2.0 |
| **Auth pattern** | OAuth 2.0 (JWT Bearer flow) |
| **Key fields** | `Scope3ProcurementItem.Amount`, `Scope3ProcurementItem.Quantity`, `Account.Name`, `Account.Industry`, `ProcurementEmissionFctr.EmissionFactorValue`, `EmissionsActivity.ActivityValue` |
| **Carbon-specific** | Full carbon accounting platform. Native emission factors, activity tracking, Scope 1/2/3 calculations. Can export calculated emissions directly. |
| **MCP server** | Salesforce MCP servers exist (community). May need customization for Net Zero Cloud objects. |
| **Build priority** | **Phase 2** -- rich carbon data, standard API |

## 8. HubSpot

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (JSON) |
| **Auth pattern** | OAuth 2.0, API key (legacy) |
| **Key fields** | `Deal.amount`, `Company.name`, `Company.industry`, `Deal.pipeline`, `LineItem.amount` |
| **Carbon-specific** | No carbon features. CRM deal data useful for Scope 3 Category 11 (use of sold products) estimation via revenue proxy. |
| **MCP server** | Community HubSpot MCP servers available. |
| **Build priority** | **Phase 3** -- limited carbon relevance |

## 9. Coupa

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (JSON/XML) |
| **Auth pattern** | OAuth 2.0 |
| **Key fields** | `Invoice.LineItems[].Amount`, `Supplier.Name`, `CommodityCode` (UNSPSC), `Invoice.Currency`, `RequisitionLine.Quantity`, `RequisitionLine.UOM` |
| **Carbon-specific** | UNSPSC codes (direct to crosswalk), EcoVadis ratings, GHG emission models built-in, spend analytics by category. Native sustainability scoring. |
| **MCP server** | None available. Build via REST adapter. |
| **Build priority** | **Phase 2** -- UNSPSC codes enable direct crosswalk |

## 10. SAP Ariba

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST via SAP BTP (JSON) |
| **Auth pattern** | OAuth 2.0 (SAP BTP) |
| **Key fields** | `PurchaseOrder.LineItem.Amount`, `Supplier.Name`, `UnspscCode`, `Currency`, `Quantity` |
| **Carbon-specific** | PACT V2 Product Carbon Footprints, supplier sustainability profiles, UNSPSC classification. |
| **MCP server** | None available. Shares SAP BTP auth with S/4HANA. |
| **Build priority** | **Phase 4** -- couples with SAP S/4HANA |

## 11. Jaggaer

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (JSON) |
| **Auth pattern** | OAuth 2.0, API key |
| **Key fields** | `PO.LineItem.Amount`, `Supplier.Name`, `CategoryCode`, `Currency` |
| **Carbon-specific** | Carbmee Product Carbon Footprint data, ESG scoring, Scope 3 hotspot analysis. |
| **MCP server** | None available. |
| **Build priority** | **Phase 3** -- niche procurement |

## 12. SAP Concur

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST v4 (JSON) |
| **Auth pattern** | OAuth 2.0 (Unified Token) |
| **Key fields** | `ExpenseEntry.TransactionAmount`, `ExpenseEntry.TransactionCurrencyCode`, `ExpenseType.Name`, `Vendor.Name`, `Trip.Segments[].Origin/Destination`, `Trip.Segments[].CabinClass`, `Hotel.CheckInDate/CheckOutDate`, `Car.TotalMiles` |
| **Carbon-specific** | ISO 14083 CO2e per segment via Thrust Carbon integration. IATA airport codes, cabin class, hotel nights, car mileage -- all directly map to DEFRA/ICAO emission factors. |
| **MCP server** | None available. Build via REST v4. |
| **Build priority** | **Phase 2** -- rich travel emission data (Cat 6) |

## 13. Navan (TripActions)

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (JSON) |
| **Auth pattern** | OAuth 2.0, API key |
| **Key fields** | `Booking.TotalCost`, `Flight.Segments[].Origin/Destination`, `Flight.CabinClass`, `Hotel.Nights`, `Car.Miles` |
| **Carbon-specific** | Navan Carbon View: per-segment CO2e using DEFRA, TREMOD, ICAO methods. Pre-calculated emissions available via API. |
| **MCP server** | None available. |
| **Build priority** | **Phase 2** -- pre-calculated travel emissions |

## 14. Brex

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (OpenAPI, JSON) |
| **Auth pattern** | OAuth 2.0 |
| **Key fields** | `Transaction.Amount`, `Transaction.MerchantCategoryCode`, `Transaction.MerchantName`, `Transaction.CurrencyCode`, `Transaction.Date` |
| **Carbon-specific** | MCC codes map directly to NAICS via `mcc_to_naics.json`. Transaction-level spend data for spend-based method. |
| **MCP server** | None available. Build via OpenAPI adapter. |
| **Build priority** | **Phase 2** -- simple API, MCC-based classification |

## 15. Ramp

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (OpenAPI, JSON) |
| **Auth pattern** | Bearer Token |
| **Key fields** | `Transaction.Amount`, `Transaction.MCC`, `Transaction.MerchantName`, `Transaction.Currency`, `Transaction.Date` |
| **Carbon-specific** | Same MCC-based approach as Brex. Trip booking details for travel categorization. |
| **MCP server** | None available. Build via OpenAPI adapter. |
| **Build priority** | **Phase 2** -- shares mapping with Brex |

## 16. BILL (Bill.com)

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (JSON) |
| **Auth pattern** | OAuth 2.0, Session-based |
| **Key fields** | `Bill.Amount`, `Vendor.Name`, `Bill.LineItems[].Amount`, `Bill.LineItems[].ChartOfAccountId`, `Bill.Currency` |
| **Carbon-specific** | No carbon features. AP data useful for spend-based Scope 3. GL-to-NAICS mapping required. |
| **MCP server** | None available. |
| **Build priority** | **Phase 3** -- AP platform, GL mapping needed |

## 17. Tipalti

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (JSON) |
| **Auth pattern** | API key (HMAC) |
| **Key fields** | `Payment.Amount`, `Payee.Name`, `Payment.Currency`, `PaymentOrder.Description` |
| **Carbon-specific** | No carbon features. Payment data can supplement spend analysis. |
| **MCP server** | None available. |
| **Build priority** | **Phase 3** -- payments only, limited categorization |

## 18. Xero

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST (JSON) |
| **Auth pattern** | OAuth 2.0 |
| **Key fields** | `Invoice.LineItems[].LineAmount`, `Invoice.Contact.Name`, `LineItem.AccountCode`, `Invoice.CurrencyCode`, `Invoice.Date` |
| **Carbon-specific** | No native carbon features. Chart of Accounts -> NAICS mapping is client-specific. Strong in ANZ/UK markets. |
| **MCP server** | `xero-mcp-server` (npm). Production-ready. |
| **Build priority** | **Phase 1** -- MCP server exists |

## 19. QuickBooks Online

| Attribute | Detail |
|-----------|--------|
| **Data format** | REST v3 (JSON) |
| **Auth pattern** | OAuth 2.0 |
| **Key fields** | `Bill.Line[].Amount`, `Bill.VendorRef` -> `Vendor.DisplayName`, `Bill.Line[].AccountRef` -> `Account`, `Bill.CurrencyRef`, `Bill.TxnDate` |
| **Carbon-specific** | No carbon features. GL-based categorization. Intuit Sustainability Hub (beta) may add carbon features. |
| **MCP server** | Community QuickBooks MCP available. |
| **Build priority** | **Phase 1** -- most popular SME accounting platform |

## 20. Workday

| Attribute | Detail |
|-----------|--------|
| **Data format** | RaaS (Report-as-a-Service, XML/JSON), REST API |
| **Auth pattern** | OAuth 2.0 with non-expiring refresh tokens |
| **Key fields** | `SupplierInvoice.Total_Amount`, `SupplierInvoice.Spend_Category`, `SupplierInvoice.Supplier.name`, `ExpenseReport.Item_Amount`, `Supplier.Supplier_Name` |
| **Carbon-specific** | No native carbon features. Spend category mapping to NAICS needed. Expense reports useful for Cat 6. |
| **MCP server** | None available. |
| **Build priority** | **Phase 4** -- enterprise, RaaS complexity |

## 21. Excel / CSV

| Attribute | Detail |
|-----------|--------|
| **Data format** | .xlsx, .csv |
| **Auth pattern** | None (local file) |
| **Key fields** | User-configured column mapping (vendor, amount, currency, category, date) |
| **Carbon-specific** | Most common initial data format. Exported from any ERP/accounting system. |
| **MCP server** | `@negokaz/excel-mcp-server` (npm), `@anthropic-ai/mcp-filesystem` |
| **Build priority** | **Phase 1** -- universal fallback, highest usage |

## 22. Chrome / Browser

| Attribute | Detail |
|-----------|--------|
| **Data format** | HTML (scraped), PDF (downloaded) |
| **Auth pattern** | Browser session (user-authenticated) |
| **Key fields** | Varies by portal -- typically vendor portal spend reports, utility bills, supplier disclosure pages |
| **Carbon-specific** | Browser automation for portals without APIs. Scrape utility bills (Scope 2), supplier spend reports (Scope 3). |
| **MCP server** | `@anthropic-ai/mcp-playwright` (npm). Production-ready. |
| **Build priority** | **Phase 1** -- MCP server exists, universal portal access |

## 23. Google Sheets

| Attribute | Detail |
|-----------|--------|
| **Data format** | Google Sheets API (JSON), CSV export |
| **Auth pattern** | OAuth 2.0 (Google) |
| **Key fields** | User-configured column mapping (same as Excel/CSV) |
| **Carbon-specific** | Common for SME data collection. Often used as intermediate format between ERP and carbon tool. |
| **MCP server** | Google Sheets MCP servers available (community). |
| **Build priority** | **Phase 1** -- MCP server exists, common SME format |

---

## Summary Table

| # | System | Data Format | Auth | Carbon Data | MCP Server | Priority |
|---|--------|-------------|------|-------------|------------|----------|
| 1 | SAP S/4HANA | OData v4 | OAuth 2.0 / X.509 | SFM PCFs | None | Phase 4 |
| 2 | Oracle NetSuite | REST / SuiteQL | OAuth 2.0 | None | None | Phase 4 |
| 3 | Oracle Fusion | REST | OAuth 2.0 | Sustainability Ledger | None | Phase 4 |
| 4 | Dynamics 365 | OData v4 | Azure AD | EPA factors | None | Phase 2 |
| 5 | Sage Intacct | XML / REST | OAuth 2.0 | None | None | Phase 3 |
| 6 | Infor | REST / ION | OAuth 2.0 | Sustainability Science | None | Phase 4 |
| 7 | Salesforce NZC | REST / SOQL | OAuth 2.0 | Full carbon platform | Community | Phase 2 |
| 8 | HubSpot | REST | OAuth 2.0 | None (CRM only) | Community | Phase 3 |
| 9 | Coupa | REST | OAuth 2.0 | UNSPSC + EcoVadis | None | Phase 2 |
| 10 | SAP Ariba | REST (BTP) | OAuth 2.0 | PACT V2 PCFs | None | Phase 4 |
| 11 | Jaggaer | REST | OAuth 2.0 / key | Carbmee PCFs | None | Phase 3 |
| 12 | Concur | REST v4 | OAuth 2.0 | ISO 14083 CO2e | None | Phase 2 |
| 13 | Navan | REST | OAuth 2.0 / key | Carbon View CO2e | None | Phase 2 |
| 14 | Brex | REST | OAuth 2.0 | MCC codes | None | Phase 2 |
| 15 | Ramp | REST | Bearer | MCC codes | None | Phase 2 |
| 16 | BILL | REST | OAuth 2.0 | None (AP only) | None | Phase 3 |
| 17 | Tipalti | REST | HMAC key | None (payments) | None | Phase 3 |
| 18 | Xero | REST | OAuth 2.0 | None (GL mapping) | npm package | Phase 1 |
| 19 | QuickBooks | REST v3 | OAuth 2.0 | None (GL mapping) | Community | Phase 1 |
| 20 | Workday | RaaS / REST | OAuth 2.0 | None | None | Phase 4 |
| 21 | Excel/CSV | File | None | User-defined | npm package | Phase 1 |
| 22 | Chrome/Browser | HTML/PDF | Session | Portal scraping | npm package | Phase 1 |
| 23 | Google Sheets | API / CSV | OAuth 2.0 | User-defined | Community | Phase 1 |

---

## Method Hierarchy by Source Type

### Best-case: Primary Data Available

Systems with pre-calculated carbon data (Salesforce NZC, Concur, Navan, D365 Sustainability Manager, Coupa GHG models):
- Maps to `supplier_primary` method in calc.compute
- Highest DQS score (0.9-1.0)
- Data enters as `primary_data.emissions_total_kgco2e`

### Mid-case: Quantity + Category Available

Systems with UNSPSC/category codes and quantity data (Coupa, SAP Ariba, SAP S/4HANA with material groups):
- Maps to `average_quantity` method
- DQS score (0.6-0.8)
- Data enters as `quantity + unit + category`

### Base-case: Spend Only

Systems with transaction amounts and vendor names (QuickBooks, Xero, Brex, Ramp, BILL):
- Maps to `spend` method (EPA EEIO)
- DQS score (0.3-0.6)
- Data enters as `amount + currency + category (via MCC/GL mapping)`

### Integration Approach per Phase

| Phase | Systems | Connector Type | Effort |
|-------|---------|---------------|--------|
| 1 | Excel, CSV, Sheets, Browser, Xero, QB | Existing MCP + mapping YAML | Low |
| 2 | Concur, Coupa, Brex, Ramp, Navan, D365, Salesforce | REST adapter + mapping YAML | Medium |
| 3 | Sage, BILL, Tipalti, HubSpot, Jaggaer | Unified API or custom REST | Medium |
| 4 | SAP, Oracle, Workday, Infor, Ariba | Complex enterprise connectors | High |
