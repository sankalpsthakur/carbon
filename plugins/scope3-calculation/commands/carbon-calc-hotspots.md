---
name: carbon-calc-hotspots
description: Identify emission hotspots by vendor, category, and method across computed inventory items.
allowed-tools:
  - calc.db.get
  - calc.db.list
  - calc.compute
  - Read
  - Glob
---
Analyze computed inventory items to find emission hotspots.

## Prerequisites

Ensure compute has been run for the target job. Call `calc.compute` with `job_id` if needed.

## Step 1: Load inventory items

Use `calc.db.list` with `collection: "inventory_items"` and `query: { "job_id": "<job_id>" }`.

## Step 2: Rank by emissions

Sort inventory items by `emissions_total_kgco2e` descending.

Report the top 10 emitters with:
- vendor
- item_description
- category
- method used
- emissions_total_kgco2e
- percentage of total emissions

## Step 3: Group by vendor

Aggregate emissions by vendor. Show:
- Vendor name
- Total kgCO2e
- Item count
- Dominant method
- Percentage of total

## Step 4: Group by category

Aggregate emissions by category. Show:
- Category name
- Total kgCO2e
- Item count
- Percentage of total

## Step 5: Method distribution

Show the breakdown of emissions by calculation method:
- supplier_primary: count and total kgCO2e
- average_quantity: count and total kgCO2e
- spend: count and total kgCO2e
- none: count and total kgCO2e

## Deliverable

Present a hotspot report with:
- Top 10 emitters table
- Vendor concentration analysis
- Category breakdown
- Method quality distribution
- Recommendations for reducing high-emission items or improving data quality
