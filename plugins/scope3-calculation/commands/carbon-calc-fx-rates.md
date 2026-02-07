---
name: carbon-calc-fx-rates
description: Manage FX rates and test currency normalization for multi-currency calculation jobs.
allowed-tools:
  - calc.fx_normalize
  - calc.db.get
  - calc.db.set
  - calc.db.list
  - calc.db.delete
  - Read
  - Glob
---
Manage foreign exchange rates used for spend normalization in multi-currency jobs.

## Built-in rates

The server includes default rates to USD for major currencies:
USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, INR, BRL, KRW, SEK, NOK, DKK, SGD, HKD, MXN, ZAR, NZD.

Cross-currency conversion is supported via triangulation through USD.

## Test a conversion

Use `calc.fx_normalize` with:
- `amount`: value to convert
- `from_currency`: source currency code
- `to_currency`: target currency code

The result includes the rate used and converted amount.

## View custom rates

Use `calc.db.list` with `collection: "fx_rates"` to see all custom rate overrides.

## Add or update a custom rate

Use `calc.db.set` with `collection: "fx_rates"` and a doc like:
```json
{
  "pair": "EUR/GBP",
  "rate": 0.85,
  "source": "manual",
  "effective_date": "2026-01-01"
}
```

Custom rates take priority over built-in defaults when the pair matches exactly.

## Delete a custom rate

Use `calc.db.delete` with `collection: "fx_rates"` and `query: { "pair": "EUR/GBP" }`.

## Check job currencies

Use `calc.db.get` with `collection: "jobs"` and `query: { "_id": "<job_id>" }` to see the job's `reporting_currency` and reconciliation `currencies` list.

For each source currency in the job, verify a rate exists by calling `calc.fx_normalize` with amount 1.

## Deliverable

Present an FX rate summary:
- Reporting currency for the job
- All source currencies found in activity data
- Rate used for each currency pair
- Any missing rates that need to be added before compute
