---
name: travel-emission-methods
description: Distance-based vs spend-based travel emission calculation methods for Scope 3 Category 6 (Business Travel) and Category 7 (Employee Commuting).
---
Use when:
- Calculating emissions from business travel expense data.
- Choosing between distance-based and spend-based calculation methods.
- Mapping travel expense types to GHG Protocol Scope 3 categories.

## GHG Protocol Scope 3 Travel Categories

**Category 6 - Business Travel**: Emissions from employee business travel in vehicles not owned by the company.
- Flights (domestic and international)
- Hotels and accommodation
- Rail travel
- Rental cars
- Taxis and rideshares
- Meals during business travel (optional)

**Category 7 - Employee Commuting**: Emissions from employees traveling between home and work.
- Daily commute by car, bus, rail, cycling
- Work-from-home energy use (emerging methodology)

## Distance-based method (preferred)

Higher accuracy. Requires itinerary or distance data.

### Flights
```
emissions = distance_km * factor(haul_class, cabin_class) * passengers
```

Haul classification:
- Short haul: <1500 km (e.g. NYC-Chicago, London-Paris)
- Medium haul: 1500-4000 km (e.g. NYC-LA, London-Istanbul)
- Long haul: >4000 km (e.g. NYC-London, SF-Tokyo)

Cabin class multipliers (relative to economy):
- Economy: 1.0x base
- Premium economy: 1.5-1.6x
- Business: 2.0-2.9x (varies by haul)
- First: 3.0-4.0x

All flight factors include radiative forcing uplift (1.9x) for non-CO2 effects (NOx, contrails, water vapor).

### Hotels
```
emissions = room_nights * factor(region)
```
Regional factors vary 2x between lowest (Europe western: ~14 kgCO2e/night) and highest (Middle East: ~29 kgCO2e/night).

### Rail
```
emissions = distance_km * factor(rail_type)
```
Rail is typically 3-30x lower carbon than flying the same distance. Electric high-speed rail (TGV, Shinkansen) has the lowest factors.

### Rental cars
```
emissions = rental_days * factor(vehicle_class)
```
Assumes average daily distance of 80 km. EV rentals are ~5x lower than petrol.

## Spend-based method (fallback)

Lower accuracy. Use when only monetary spend data is available.

```
emissions = spend_usd * factor(expense_type)
```

Spend-based factors (kgCO2e per USD):
| Expense Type | Factor |
|-------------|--------|
| Airfare | 1.08 |
| Hotel | 0.52 |
| Rail | 0.37 |
| Rental car | 0.68 |
| Taxi/rideshare | 0.45 |
| Meals | 0.67 |
| Other travel | 0.40 |

Spend-based method weaknesses:
- Price fluctuations affect emissions (expensive ticket != more emissions)
- Business class costs 3-5x economy but emissions only 2-3x
- Regional price differences (same flight costs different in different markets)

## Method selection hierarchy

1. **Distance + cabin class** (best): Use when itinerary data available from booking system
2. **Distance only** (good): Assume economy class; estimate distance from city pairs
3. **Spend-based** (acceptable): Use EEIO/EPA factors when only expense amounts available
4. **Exclude** (worst): Do not exclude travel data; use spend-based as minimum

## Concur expense type mapping

| ExpenseTypeName | Category | Preferred Method |
|----------------|----------|-----------------|
| Airfare | 6 | Distance-based (check for itinerary) |
| Hotel | 6 | Per-night by region |
| Car Rental | 6 | Per-day by vehicle class |
| Rail/Train | 6 | Distance-based |
| Taxi/Uber/Lyft | 6 | Distance or spend-based |
| Meals - Business | 6 | Spend-based |
| Parking | 6 | Spend-based |
| Mileage | 7 | Distance-based (known distance) |

Done criteria:
- Each travel expense entry has an assigned calculation method.
- Distance-based is used where itinerary data exists.
- Spend-based is used as documented fallback, not as primary method.
- Results include method attribution for audit trail.
