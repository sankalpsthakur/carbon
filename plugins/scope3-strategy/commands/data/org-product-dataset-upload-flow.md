---
name: org-product-dataset-upload-flow
description: Run org creation, product setup, and dataset ingestion using the exact strategy API payloads and parsing constraints.
allowed-tools:
  - Read
  - Write
  - Edit
  - MultiEdit
  - Glob
  - Grep
  - Bash
---
Execute the Stage 0 setup and ingestion flow exactly against the strategy backend.

Endpoints and payloads:
1. `POST /api/orgs`
- Body:
  - `name` (string)
  - `industry_template` (enum): `construction|manufacturing|chemicals|automotive|food_agri|retail_cpg|energy_utilities|electronics`

2. `POST /api/products`
- Body:
  - `org_id` (string)
  - `name` (string)
  - `sku` (string)
  - `unit` (string, default `unit`)
  - `category` (string|null)

3. `POST /api/datasets/lca/upload`
- Query params:
  - `org_id` (required)
  - `provider` (`manual|oneclicklca|sphera`, default `manual`)
  - `study_year` (optional int)
- Multipart:
  - `file` (required; `.csv` or `.json`)
- CSV required column: `product_sku`.
- Optional numeric columns parsed into `unit_impacts`:
  - `gwp_kg_co2e_per_unit`, `water_m3_per_unit`, `water_high_stress_share`, `virgin_material_kg_per_unit`, `recycled_material_kg_per_unit`, `waste_kg_per_unit`
  - `pollutant_<substance>_<compartment>`.

4. `POST /api/datasets/volumes/upload`
- Query params:
  - `org_id` (required)
  - `provider` (`manual|erp`, default `manual`)
- Multipart:
  - `file` (required; `.csv` or `.json`)
- CSV required columns: `product_sku`, `year`, `volume_units`; optional `revenue_eur`.

5. `POST /api/datasets/scope12`
- Body:
  - `org_id`, `year`, `scope1_tco2e`, `scope2_tco2e`, `methodology_id`, `notes`

Optional extended manual datasets:
- `POST /api/datasets/scope3` with `org_id`, `year`, `categories[]`.
- `POST /api/biodiversity` with ESRS E4 biodiversity fields.

Hard validation gates:
- `POST /api/products` must fail with `404` when org is missing and `409` when SKU already exists.
- LCA upload must fail with `400` when required CSV columns are missing (`product_sku`) or no datasets are parsed.
- Volume upload must fail with `400` when required CSV columns are missing (`product_sku, year, volume_units`) or no records are parsed.
- Any dataset upload for inaccessible org must fail with `404 Org not found` (owner-only in these routes).

Deliverable:
- Intake checkpoint containing `org_id`, created `product_id[]`, uploaded dataset counts by type, and any rejected files with exact gate reason.
