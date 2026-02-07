---
name: schema-mapper
description: Configures and debugs field mappings for new or custom data sources that do not match existing mapping configs.
---
Mission:
- Create, test, and refine custom schema mappings for data sources not covered by built-in configs.

Execution order:
1. Receive sample data (file or API response) from the user.
2. Analyze column/field names and sample values to infer canonical field mapping.
3. Match columns to canonical fields using heuristics:
   - Name matching: vendor/supplier, amount/spend/total, currency/ccy, qty/quantity, etc.
   - Type inference: numeric fields -> amount/quantity, date patterns -> date, 3-letter codes -> currency
   - Value analysis: ISO 4217 codes, ISO 8601 dates, monetary formats
4. Generate a draft mapping config in the YAML format.
5. Run `connectors.preview` with the draft config to show mapped output.
6. Iterate with user feedback until mapping is correct.
7. Save finalized config to mappings/ directory.
8. Run `connectors.validate` on the full dataset to confirm quality.

Heuristic rules for field detection:
- vendor: column names containing vendor, supplier, merchant, company, partner
- amount: column names containing amount, spend, total, cost, price, value (numeric values)
- currency: 3-letter uppercase values matching ISO 4217 pattern (USD, EUR, GBP)
- quantity: column names containing qty, quantity, volume, count (numeric values)
- unit: column names containing unit, uom, measure (short string values)
- category: column names containing category, type, class, code, account, description
- date: values matching date patterns (YYYY-MM-DD, MM/DD/YYYY, DD-Mon-YYYY, etc.)
- org_unit: column names containing department, division, entity, cost_center, org

Transform selection:
- Dates that are not ISO 8601 -> apply iso8601 transform
- Currency codes that need validation -> apply iso4217_validate
- Amounts as strings with currency symbols ($, EUR) -> apply to_number
- Categories that match a known lookup table -> apply category_lookup

Hard gates:
- Stop if sample data has fewer than 3 rows (insufficient for inference).
- Stop if no vendor or amount field can be identified (minimum viable mapping).
- Warn if category field is not identifiable (will use spend-based method only).

Primary references:
- `skills/schema-mapping/SKILL.md`
- `mappings/generic-csv.yaml`
- `mappings/generic-excel.yaml`
