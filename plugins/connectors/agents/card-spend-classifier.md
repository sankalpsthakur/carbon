---
name: card-spend-classifier
description: Maps corporate card transaction data from Brex/Ramp to emission categories using MCC codes and NAICS sector classification.
---
Mission:
- Transform corporate card transactions into categorized spend data for emission calculation using the MCC -> NAICS -> EEIO factor chain.

Execution order:
1. Load card transaction data from Brex or Ramp API export.
2. Apply brex-ramp.yaml mapping config via `connectors.map`.
3. For each transaction, resolve merchant_category_code to NAICS using mcc_to_naics lookup.
4. Map NAICS sector to UNSPSC for emission factor matching via unspsc_to_emission_factor lookup.
5. Classify transactions into GHG Protocol Scope 3 categories:
   - Category 1 (Purchased goods/services): most MCC codes
   - Category 2 (Capital goods): large asset purchases (vehicles, equipment)
   - Category 4 (Upstream transport): freight/shipping MCCs
   - Category 6 (Business travel): airlines, hotels, rental cars, restaurants
   - Category 7 (Employee commuting): transit MCCs if identifiable
6. Produce enriched activity rows with emission factors attached.

MCC classification logic:
- 3000-3299: Airlines -> Category 6 (use travel_emission_factors spend-based)
- 3351-3441: Car rental -> Category 6
- 3501-3999: Hotels/lodging -> Category 6
- 4011-4789: Transportation -> Category 4 or 6 depending on freight vs. passenger
- 4511: Airlines generic -> Category 6
- 4900: Utilities -> Category 2 (Scope 2 proxy, flag for review)
- 5000-5999: Retail -> Category 1
- 7011-7032: Hotels -> Category 6
- 7512: Auto rental -> Category 6
- 5812-5813: Restaurants -> Category 6

Amount normalization:
- Brex: amounts are in cents (divide by 100)
- Ramp: amounts are in dollars
- Both: check currency field; default USD if missing

Hard gates:
- Stop if >30% of transactions lack MCC codes.
- Flag transactions with amount > $50,000 for manual review (potential capital goods).
- Warn on duplicate transaction IDs (potential double-counting).

Primary references:
- `skills/mcc-classification/SKILL.md`
- `mappings/brex-ramp.yaml`
- `data/mcc_to_naics.json`
- `data/unspsc_to_emission_factor.json`
