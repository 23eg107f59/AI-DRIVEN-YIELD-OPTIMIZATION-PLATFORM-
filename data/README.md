# Yield dataset

`oilseed_yield.csv` is a small, **synthetic demonstration dataset** created to
exercise the training and prediction workflow. It is not observed field data,
does not represent a validated agronomic model, and must not be used for farm
decisions. Model metrics produced from this file are only software-pipeline
checks; the UI labels these predictions experimental.

The training schema is one row per hypothetical crop-growing scenario:

| Column | Meaning |
| --- | --- |
| crop, region, season | Crop and scenario categories |
| rainfall_mm, temperature_c | Scenario weather values |
| soil_type, soil_ph | Soil categories and pH |
| nitrogen_kg_ha, phosphorus_kg_ha, potassium_kg_ha | Nutrient inputs |
| irrigation, seed_variety | Management categories |
| fertilizer_kg_ha | Fertilizer input |
| previous_yield_kg_ha | Optional historical yield |
| yield_kg_ha | Target yield (kg/ha) |

`area_ha` is accepted by the prediction API to calculate estimated total
production, but excluded from model features because yield is expressed per
hectare. Replace this CSV with well-documented, regionally appropriate
observations before interpreting model performance.

## Source and citation

This CSV was authored for the Oilseed AI development demonstration. It is
synthetic and has no external data source or scientific citation. State and
crop labels are hypothetical scenario coverage, not farm observations. The
workspace contains no verified public field-yield dataset suitable for a real
agricultural performance claim.

## Official regional statistics imported by the application

The application keeps official regional data separate from this synthetic
model-training CSV. Its configured ICAR-NSRI adapters use public annual XLSX
workbooks: `cropAPY.xlsx` for crop-wise India aggregates and `stateAPY.xlsx`
for state-wise soybean statistics. Original APY fields are converted from
thousand hectares and thousand tonnes to hectares and tonnes. Reported yields
are retained, calculated yields and any discrepancies are stored separately,
and source workbook identities are preserved in SQLite. These are regional
statistics, never simulated farmer records. See the project README for source
verification, sync configuration, limitations, and API endpoints.

Training marks non-numeric and out-of-range feature values as missing for the
fitted imputers, removes duplicate rows, and discards records without a valid
non-negative target or region. Zero-yield observations are retained for
regression metrics but excluded from MAPE. Evaluation groups by a farm identifier when
available, otherwise by region, so a group is not shared between training
and held-out test partitions.
