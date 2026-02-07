---
name: schema-mapping
description: How CarbonKit field mapping works, including transforms, lookup tables, and the canonical activity-row format.
---
Use when:
- Mapping source data fields to the canonical 8-field format.
- Configuring transforms for date, currency, and category fields.
- Debugging why mapped values are null or incorrect.

## Canonical format

Every data source maps to these 8 fields:

| Field    | Type   | Required | Description                              |
|----------|--------|----------|------------------------------------------|
| vendor   | string | yes      | Supplier/merchant name                   |
| amount   | number | yes      | Monetary amount (unit price or total)     |
| currency | string | yes      | ISO 4217 currency code (USD, EUR, GBP)   |
| quantity | number | no       | Physical quantity purchased               |
| unit     | string | no       | Unit of measure (kg, kWh, liters, each)  |
| category | string | no       | UNSPSC code or source-specific category   |
| date     | string | yes      | ISO 8601 date (YYYY-MM-DD)               |
| org_unit | string | no       | Department, cost center, or legal entity  |

## Mapping config structure

```yaml
source: <name>
canonical_mapping:
  vendor: "<source_field_path>"    # e.g. "Supplier" or "vendor.companyName"
  amount: "<source_field_path>"
  ...
transforms:
  date: "iso8601"                  # normalize date formats
  currency: "iso4217_validate"     # validate 3-letter currency codes
  category_lookup: "<table_name>"  # lookup table for category enrichment
```

## Field path resolution

Nested fields use dot notation: `vendor.companyName` resolves `row.vendor.companyName`.
Set to `"null"` for fields that do not exist in the source (e.g. quantity for expense data).

## Available transforms

- `iso8601`: Parse any date format and output YYYY-MM-DD
- `iso4217_validate`: Validate and uppercase 3-letter currency codes
- `to_number`: Convert string to number (strips currency symbols)
- `to_string`: Convert any value to string
- `uppercase`: Convert to uppercase
- `trim`: Remove leading/trailing whitespace

## Lookup tables

Category enrichment via lookup tables in `data/`:
- `material_group_to_unspsc`: SAP MaterialGroup -> UNSPSC
- `coupa_taxonomy_to_unspsc`: Coupa commodity -> UNSPSC
- `mcc_to_naics`: Merchant Category Code -> NAICS sector
- `unspsc_to_emission_factor`: UNSPSC -> kgCO2e/USD factor

## Activity row conversion

Canonical rows convert to calc-mcp activity_rows format:
- `vendor` -> `vendor`
- `amount` -> `spend_original`
- `currency` -> `currency_original`
- `quantity` -> `quantity`
- `unit` -> `unit`
- `category` -> `category` and `item_description`
- `date` -> preserved as metadata
- `org_unit` -> preserved as metadata

Done criteria:
- All required fields (vendor, amount, currency, date) resolve to non-null values.
- Transforms produce valid output (dates are ISO 8601, currencies are 3-letter codes).
- Category lookup resolves to UNSPSC where a lookup table is configured.
