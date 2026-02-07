# 03: Scope 1/2 MCP Server

## Overview

Workstream 3 builds the runtime engine for `scope12-accounting`, the plugin with the richest formula documentation but zero executable code. The new `scope12-mcp.js` server implements 14 tools covering Scope 1 calculation (4 source types), Scope 2 dual-ledger, KPI normalization, evidence validation, and report export.

---

## Tool Definitions (14)

| Tool | Description |
|------|-------------|
| `scope12.health` | Server info + timestamp |
| `scope12.sha256` | SHA-256 hex digest |
| `scope12.db.get` | Collection query with filter |
| `scope12.db.set` | Upsert by `_id` |
| `scope12.db.delete` | Delete with empty-query guard |
| `scope12.db.list` | List with filter and limit |
| `scope12.db.bulkSet` | Batch upsert for seeding reference data |
| `scope12.scope1.calculate` | Scope 1 engine: 4 source types, gas-level GWP, biogenic separation |
| `scope12.scope2.calculate` | Scope 2 dual-ledger: location-based + market-based |
| `scope12.kpi.normalize` | 5 intensity KPIs with coverage ratio gate |
| `scope12.report.export` | Report pack with tie-outs and MB coverage table |
| `scope12.period.close` | Period close with restatement governance |
| `scope12.dq.score` | Data quality scoring (5 dimensions) |
| `scope12.evidence.validate` | Market-based evidence schema validation (16+ fields) |

---

## Scope 1 Engine

### Source Types

#### 1. Stationary Combustion

```
E = SUM( fuel_consumed_i * EF_gas_i * GWP_gas ) for each gas (CO2, CH4, N2O)

Inputs:
  - fuel_type: string (natural_gas, diesel, propane, coal, biomass, etc.)
  - fuel_consumed: number
  - fuel_unit: string (m3, liters, kg, MMBtu, therms)
  - source_id: string (boiler, furnace, generator identifier)

Processing:
  1. Normalize fuel quantity to standard unit per fuel type
  2. Look up combustion emission factor from combustion_factors.json
  3. Apply per-gas: CO2 = fuel * EF_CO2, CH4 = fuel * EF_CH4, N2O = fuel * EF_N2O
  4. Convert each gas to CO2e using GWP table (AR5 or AR6, configurable)
  5. Sum CO2e across gases
  6. If fuel_type is biomass: track CO2 in biogenic_co2 column, exclude from total

Output per source:
  { source_id, fuel_type, co2_kg, ch4_kg, n2o_kg, co2e_kg, biogenic_co2_kg }
```

#### 2. Mobile Combustion

```
E = SUM( fuel_consumed * EF_gas * GWP_gas ) per gas per vehicle/fleet

Inputs:
  - vehicle_type: string (passenger_car, light_truck, heavy_truck, etc.)
  - fuel_type: string (gasoline, diesel, cng, lpg, biodiesel, etc.)
  - fuel_consumed: number
  - fuel_unit: string (liters, gallons, kg)
  - distance: number (optional, for distance-based method)
  - distance_unit: string (km, miles)

Processing:
  1. If fuel-based: same as stationary combustion per gas
  2. If distance-based: distance * distance_EF_gas * GWP_gas
  3. Biogenic CO2 for biodiesel/ethanol tracked separately
```

#### 3. Process Emissions

```
E = SUM( activity_data * process_EF * GWP_gas )

Inputs:
  - process_type: string (cement_clinker, lime, ammonia, aluminum, etc.)
  - activity_data: number (tonnes produced, etc.)
  - activity_unit: string

Processing:
  1. Look up process-specific emission factor
  2. Apply per-gas EF (process emissions may include CO2, CH4, N2O, PFCs)
  3. GWP conversion per gas
```

#### 4. Fugitive Emissions (F-Gases & Refrigerants)

```
E = SUM( charge_kg * (1 - recovery_rate) * GWP_gas )

Inputs:
  - equipment_type: string (chiller, AC, fire_suppression, switchgear, etc.)
  - refrigerant_type: string (R-134a, R-410A, R-22, SF6, etc.)
  - charge_kg: number (initial or annual charge)
  - recovery_rate: number (0 to 1, fraction recovered at end of life)

Processing:
  1. Look up GWP for specific refrigerant from refrigerant_gwp.json
  2. Calculate emissions: charge * (1 - recovery) * GWP
  3. For SF6 in switchgear: use leak rate method instead
```

### GWP Application

```
CO2e_total = CO2 * GWP_CO2 + CH4 * GWP_CH4 + N2O * GWP_N2O + SUM(F-gas * GWP_F-gas)

AR6 GWP-100 values (subset):
  CO2 = 1, CH4 = 27.9 (fossil) / 27.2 (biogenic), N2O = 273
  HFC-134a = 1526, HFC-32 = 771, R-410A = 2256
  SF6 = 25200, NF3 = 17400

Biogenic CO2: tracked in separate column, NOT included in Scope 1 total
```

### Hard Gates

| Gate | Condition | Action |
|------|-----------|--------|
| Unknown unit | Unit not in conversion table | FAIL with error message |
| Missing GWP | Declared gas has no GWP entry | FAIL -- must add to GWP table |
| Proxy without exception | proxy data tier without documented exception | FAIL -- require waiver |
| DQ score threshold | DQ score > 3.0 without signed waiver | FAIL -- escalate |

### Factor Hierarchy (4 Tiers)

| Tier | Source | DQ Score Range |
|------|--------|---------------|
| 1. Measured | Direct CEMS/flowmeter data | 1.0 - 1.5 |
| 2. Calculated | Stoichiometric from fuel analysis | 1.5 - 2.0 |
| 3. Published | EPA AP-42 / IPCC defaults | 2.0 - 3.0 |
| 4. Estimated | Engineering estimate with uncertainty | 3.0 - 4.0 |

---

## Scope 2 Dual-Ledger Engine

### Location-Based

```
E_LB = SUM( kWh_consumed_site * grid_average_factor_region )

For each site:
  1. Normalize energy to kWh:
     - 1 MWh = 1000 kWh
     - 1 GJ = 277.778 kWh
     - 1 MMBtu = 293.071 kWh
  2. Look up grid factor by region from grid_factors_2024.json
  3. Apply: site_emissions_lb = kWh * factor
```

### Market-Based

```
E_MB = SUM( kWh_consumed_site * contractual_factor_site )

Hierarchy (in priority order):
  1. Contractual instruments (EACs, PPAs, RECs)
     -> Use supplier-specific factor
     -> Gate: ownership_status MUST be 'owned_and_retired'
  2. Residual mix factor
     -> Use grid residual after certificates removed
  3. Fallback + exception
     -> Use grid average + document exception reason
  4. FAIL
     -> Block reporting, escalate to user

For each site:
  1. Check if valid contractual evidence exists (PPA, REC, EAC)
  2. Validate evidence against 16-field schema
  3. If owned_and_retired: use contractual factor (often 0 for 100% renewable)
  4. If no evidence: fall to residual mix, then grid average fallback
  5. Track which hierarchy tier was used per site
```

### On-Site Generation

```
If on-site solar/wind:
  net_import = grid_consumption - on_site_generation
  Only net_import uses grid factor
  On-site generation uses zero factor (or PPA factor if applicable)
```

### Evidence Schema (16 Required Fields)

```json
{
  "certificate_id": "REC-2024-001234",
  "issuer": "Green-e",
  "generation_source": "Wind Farm Alpha",
  "generation_period_start": "2024-01-01",
  "generation_period_end": "2024-12-31",
  "generation_mwh": 5000,
  "technology": "wind",
  "location": "US-TX-ERCOT",
  "grid_region": "ERCOT",
  "retirement_date": "2024-03-15",
  "retirement_registry": "M-RETS",
  "ownership_status": "owned_and_retired",
  "beneficiary": "Acme Corp",
  "vintage_year": 2024,
  "tracking_system": "M-RETS",
  "verification_standard": "Green-e Energy"
}
```

---

## KPI Normalization

### 5 Intensity KPIs

| # | KPI | Unit | Formula |
|---|-----|------|---------|
| 1 | Carbon intensity by revenue | tCO2e / M$ | total_emissions / revenue_musd |
| 2 | Carbon intensity by output | kgCO2e / unit | total_emissions_kg / units_produced |
| 3 | Carbon intensity by headcount | tCO2e / FTE | total_emissions / fte_count |
| 4 | Carbon intensity by floor area | kgCO2e / m2 | total_emissions_kg / floor_area_m2 |
| 5 | Energy carbon intensity | tCO2e / MWh | scope2_emissions / total_mwh |

### Coverage Ratio Gate

```
coverage = measured_emissions / total_estimated_emissions

If coverage < 0.80 -> WARN (report with caveat)
If coverage < 0.50 -> FAIL (block KPI calculation)
```

### Revenue Normalization

```
constant_currency_revenue = nominal_revenue * (base_year_fx / current_fx)
deflator_adjusted_revenue = nominal_revenue / CPI_deflator
```

### Base-Year Indexing

```
index = (current_year_intensity / base_year_intensity) * 100
```

### Rebasing Triggers (5)

1. Structural change (M&A, divestiture)
2. Methodology change (new EF source)
3. Boundary change (new facility)
4. Cumulative error > 5%
5. Sector benchmark realignment

---

## Bundled Reference Data

| File | Content | Records | Source |
|------|---------|---------|--------|
| `scope12-accounting/data/gwp_ar5.json` | IPCC AR5 GWP-100 table | ~20 gases | IPCC AR5 |
| `scope12-accounting/data/gwp_ar6.json` | IPCC AR6 GWP-100 table | ~20 gases | IPCC AR6 |
| `scope12-accounting/data/grid_factors_2024.json` | eGRID subregion + IEA country factors | ~100 regions | eGRID + IEA |
| `scope12-accounting/data/combustion_factors.json` | EPA AP-42 + IPCC stationary/mobile defaults | ~50 fuel types | EPA AP-42 |
| `scope12-accounting/data/refrigerant_gwp.json` | Refrigerant GWP values | ~30 refrigerants | IPCC/Ashrae |

### Data Format (gwp_ar6.json example)

```json
[
  { "gas": "CO2", "formula": "CO2", "gwp_100": 1, "category": "well_mixed" },
  { "gas": "Methane (fossil)", "formula": "CH4", "gwp_100": 29.8, "category": "well_mixed" },
  { "gas": "Nitrous oxide", "formula": "N2O", "gwp_100": 273, "category": "well_mixed" },
  { "gas": "HFC-134a", "formula": "CH2FCF3", "gwp_100": 1526, "category": "hfc" },
  { "gas": "SF6", "formula": "SF6", "gwp_100": 25200, "category": "pfc" }
]
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `scope12-accounting/tools/scope12-mcp.js` | NEW -- 14-tool MCP server |
| `scope12-accounting/data/gwp_ar5.json` | NEW -- AR5 GWP table |
| `scope12-accounting/data/gwp_ar6.json` | NEW -- AR6 GWP table |
| `scope12-accounting/data/grid_factors_2024.json` | NEW -- Grid emission factors |
| `scope12-accounting/data/combustion_factors.json` | NEW -- Combustion factors |
| `scope12-accounting/data/refrigerant_gwp.json` | NEW -- Refrigerant GWP values |
| `scope12-accounting/.mcp.json` | MODIFY -- Add scope12-local server entry |
| `scope12-accounting/.claude-plugin/plugin.json` | MODIFY -- Add mcpServers reference |
| `plugins/test-mcp-servers.js` | MODIFY -- Add scope12 server test |

## Verification

```bash
# Health check
node test-mcp-servers.js  # scope12 added to server list

# Scope 1 calculation with all 4 source types
node scope12-accounting/tools/__tests__/scope12-mcp.test.js

# Verify known results against sample data
# Stationary: 100 m3 natural gas -> ~188 kgCO2e
# Mobile: 1000 liters diesel -> ~2,680 kgCO2e
# Fugitive: 10 kg R-134a @ 50% recovery -> ~7,630 kgCO2e
```
