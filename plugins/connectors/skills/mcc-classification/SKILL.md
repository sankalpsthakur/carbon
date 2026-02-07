---
name: mcc-classification
description: How MCC (Merchant Category Code) maps to NAICS sectors and then to EEIO emission factors for corporate card spend.
---
Use when:
- Classifying corporate card transactions (Brex, Ramp, Amex) for emission calculation.
- Mapping MCC codes to GHG Protocol Scope 3 categories.
- Understanding the MCC -> NAICS -> EEIO factor chain.

## MCC overview

Merchant Category Codes (MCC) are 4-digit ISO 18245 codes assigned by card networks (Visa, Mastercard) to merchants based on their primary business type.

Every card transaction carries an MCC. This is the primary classification signal for corporate card spend.

## Classification chain

```
MCC (4-digit) -> NAICS (6-digit) -> EEIO sector -> kgCO2e/USD factor
```

1. **MCC to NAICS**: Direct mapping via `mcc_to_naics.json` lookup table
2. **NAICS to EEIO**: The US EPA USEEIO model maps NAICS sectors to emission intensities
3. **EEIO to kgCO2e/USD**: Emission factors are spend-based (kgCO2e per USD spent)

## GHG Protocol category assignment

MCC ranges map to Scope 3 categories:

| MCC Range | Description | Scope 3 Category |
|-----------|-------------|-------------------|
| 3000-3299 | Airlines | Cat 6 - Business Travel |
| 3351-3441 | Car rental | Cat 6 - Business Travel |
| 3501-3999 | Hotels/lodging | Cat 6 - Business Travel |
| 4011 | Railroads (freight) | Cat 4 - Upstream Transport |
| 4111-4131 | Transit/bus/taxi | Cat 6 or Cat 7 |
| 4214-4215 | Freight/courier | Cat 4 - Upstream Transport |
| 4511 | Airlines (generic) | Cat 6 - Business Travel |
| 4900 | Utilities | Flag for Scope 2 review |
| 5000-5999 | Retail | Cat 1 - Purchased Goods |
| 7011-7032 | Hotels | Cat 6 - Business Travel |
| 7311-7399 | Business services | Cat 1 - Purchased Goods |
| 7512 | Auto rental | Cat 6 - Business Travel |
| 5812-5813 | Restaurants | Cat 6 - Business Travel |
| 8000-8999 | Professional services | Cat 1 - Purchased Goods |

## High-emission MCCs

These MCCs have disproportionately high emission factors:
- 5172 (Petroleum products): ~2.45 kgCO2e/USD
- 5541 (Gas stations): ~2.14 kgCO2e/USD
- 4511 (Airlines): ~1.08 kgCO2e/USD
- 30xx (Airlines by carrier): ~1.08 kgCO2e/USD
- 50xx (Meat/dairy suppliers): ~1.5-2.3 kgCO2e/USD

## Low-emission MCCs

These MCCs have low emission factors:
- 43xx (Software): ~0.12 kgCO2e/USD
- 84xx (Accounting): ~0.13 kgCO2e/USD
- 80xx (Consulting): ~0.18 kgCO2e/USD
- 81xx (IT services): ~0.15 kgCO2e/USD

## Brex vs Ramp differences

| Field | Brex | Ramp |
|-------|------|------|
| Amount | Cents (integer) | Dollars (decimal) |
| MCC | `merchant.mcc` | `merchant_category_code` |
| Merchant | `merchant.raw_descriptor` | `merchant_name` |
| Currency | `amount.currency` | `currency` |
| Date | `posted_at` | `transaction_date` |
| Card ID | `card.id` | `card_id` |

## Edge cases

- **MCC not in lookup table**: Use the broader MCC range (first 2 digits) to estimate sector
- **MCC 5999 (Miscellaneous retail)**: Very common catch-all; low classification quality
- **MCC 7399 (Business services NEC)**: Another common catch-all
- **Refunds/credits**: Negative amounts should be netted, not double-counted
- **Foreign transactions**: Currency conversion needed before applying USD-based factors

Done criteria:
- Every transaction has an MCC resolved to a NAICS sector.
- GHG Protocol category is assigned based on MCC range.
- Emission factor (kgCO2e/USD) is applied from EEIO data.
- Unknown MCCs are flagged but not dropped (use category average).
