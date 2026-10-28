import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

from backend.prediction import FEATURES

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA = ROOT / "data" / "oilseed_yield.csv"
DEFAULT_MODEL = ROOT / "models" / "yield_pipeline.joblib"
CATEGORICAL = ["crop", "region", "season", "soil_type", "irrigation", "seed_variety"]
NUMERICAL = [feature for feature in FEATURES if feature not in CATEGORICAL]
NUMERIC_LIMITS = {
    "rainfall_mm": (0, 5000),
    "temperature_c": (-10, 60),
    "soil_ph": (0, 14),
    "nitrogen_kg_ha": (0, 1000),
    "phosphorus_kg_ha": (0, 1000),
    "potassium_kg_ha": (0, 1000),
    "fertilizer_kg_ha": (0, 5000),
    "previous_yield_kg_ha": (0, 30000),
}


def prepare_dataset(data_path):
    data = pd.read_csv(data_path)
    required = set(FEATURES + ["yield_kg_ha"])
    missing = sorted(required - set(data.columns))
    if missing:
        raise ValueError(f"Dataset is missing required columns: {', '.join(missing)}")
    original_rows = len(data)
    group_column = next(
        (column for column in ("farm_id", "farm", "field_id", "region") if column in data.columns),
        "region",
    )
    data = data[list(dict.fromkeys(FEATURES + ["yield_kg_ha", group_column]))].copy()

    for column in NUMERICAL + ["yield_kg_ha"]:
        data[column] = pd.to_numeric(data[column], errors="coerce")
        data[column] = data[column].replace([np.inf, -np.inf], np.nan)
    for column, (minimum, maximum) in NUMERIC_LIMITS.items():
        invalid = (data[column] < minimum) | (data[column] > maximum)
        data.loc[invalid, column] = np.nan

    for column in CATEGORICAL:
        data[column] = data[column].map(
            lambda value: value.strip() if isinstance(value, str) and value.strip() else np.nan
        )

    valid_target = data["yield_kg_ha"].notna() & data["yield_kg_ha"].between(0, 30000)
    valid_group = data[group_column].notna()
    data = data.loc[valid_target & valid_group].drop_duplicates().reset_index(drop=True)
    if len(data) < 10:
        raise ValueError(
            "At least 10 unique records with a valid non-negative yield and region are required."
        )
    if data["yield_kg_ha"].nunique() < 2:
        raise ValueError("The target must contain at least two distinct yield values.")

    return data, {
        "input_rows": int(original_rows),
        "usable_rows": int(len(data)),
        "discarded_rows": int(original_rows - len(data)),
        "crop_types": sorted(data["crop"].dropna().unique().tolist()),
        "regions": sorted(data["region"].dropna().astype(str).unique().tolist()),
        "group_column": group_column,
    }


def build_pipeline():
    preprocessing = ColumnTransformer(
        transformers=[
            (
                "categorical",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="constant", fill_value="Unknown")),
                        (
                            "encoder",
                            OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                        ),
                    ]
                ),
                CATEGORICAL,
            ),
            (
                "numerical",
                SimpleImputer(strategy="median", keep_empty_features=True),
                NUMERICAL,
            ),
        ],
        remainder="drop",
    )
    return Pipeline(
        [
            ("preprocessing", preprocessing),
            (
                "regressor",
                RandomForestRegressor(
                    n_estimators=160, min_samples_leaf=1, random_state=42, n_jobs=-1
                ),
            ),
        ]
    )


def evaluate(y_test, predicted, test_frame):
    actual = y_test.to_numpy(dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    nonzero = actual != 0
    metrics = {
        "mae_kg_ha": float(mean_absolute_error(actual, predicted)),
        "rmse_kg_ha": float(np.sqrt(mean_squared_error(actual, predicted))),
        "r2_score": float(r2_score(actual, predicted)) if len(actual) >= 2 else None,
        "mape_percent": (
            float(np.mean(np.abs((actual[nonzero] - predicted[nonzero]) / actual[nonzero])) * 100)
            if nonzero.any()
            else None
        ),
        "mape_rows": int(nonzero.sum()),
    }
    residuals = actual - predicted
    test_predictions = []
    for index, row in enumerate(test_frame.itertuples(index=False)):
        test_predictions.append(
            {
                "crop": row.crop,
                "region": row.region,
                "actual_yield_kg_ha": float(actual[index]),
                "predicted_yield_kg_ha": float(predicted[index]),
                "residual_kg_ha": float(residuals[index]),
            }
        )

    crop_metrics = []
    results = pd.DataFrame(
        {
            "crop": test_frame["crop"].to_numpy(),
            "actual": actual,
            "predicted": predicted,
        }
    )
    for crop, rows in results.groupby("crop", dropna=True):
        if len(rows) < 2:
            continue
        crop_metrics.append(
            {
                "crop": str(crop),
                "test_rows": int(len(rows)),
                "mae_kg_ha": float(mean_absolute_error(rows["actual"], rows["predicted"])),
            }
        )
    return metrics, test_predictions, crop_metrics


def train(
    data_path=DEFAULT_DATA,
    model_path=DEFAULT_MODEL,
    metrics_path=None,
    source_description=None,
):
    data_path = Path(data_path)
    model_path = Path(model_path)
    metrics_path = Path(metrics_path) if metrics_path else model_path.with_name("model_metrics.json")
    data, dataset = prepare_dataset(data_path)

    group_column = dataset.pop("group_column")
    groups = data[group_column]
    if groups.nunique() < 3:
        raise ValueError(
            f"At least 3 distinct {group_column} groups are required for a leakage-aware holdout."
        )
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
    train_indices, test_indices = next(
        splitter.split(data[FEATURES], data["yield_kg_ha"], groups=groups)
    )
    train_frame = data.iloc[train_indices]
    test_frame = data.iloc[test_indices]
    X_train, y_train = train_frame[FEATURES], train_frame["yield_kg_ha"]
    X_test, y_test = test_frame[FEATURES], test_frame["yield_kg_ha"]

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)
    predicted = pipeline.predict(X_test)
    scores, test_predictions, crop_metrics = evaluate(y_test, predicted, test_frame)

    is_demo_data = data_path.resolve() == DEFAULT_DATA.resolve()
    if source_description is not None and (
        not isinstance(source_description, str) or not source_description.strip()
    ):
        raise ValueError("Dataset source description must be non-empty text when provided.")
    source = (
        "Synthetic development dataset (project-generated; no external source)"
        if is_demo_data
        else source_description.strip()
        if source_description
        else f"User-provided local CSV: {data_path.name}; citation/provenance not supplied"
    )
    report = {
        "model_name": "Random Forest Regressor",
        "dataset_source": source,
        "data_source": "synthetic_demo" if is_demo_data else "user_dataset",
        "experimental": is_demo_data,
        "dataset": {
            **dataset,
            "training_rows": int(len(train_indices)),
            "test_rows": int(len(test_indices)),
        },
        "split": {
            "method": f"GroupShuffleSplit by {group_column}",
            "test_size": 0.25,
            "random_seed": 42,
            "train_groups": sorted(set(groups.iloc[train_indices].astype(str))),
            "test_groups": sorted(set(groups.iloc[test_indices].astype(str))),
        },
        "metrics": scores,
        "test_predictions": test_predictions,
        "crop_metrics": crop_metrics,
        "evaluated_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "limitations": (
            "Synthetic development data. Metrics validate software execution only; "
            "they do not represent real-world agricultural accuracy."
            if is_demo_data
            else "Performance depends on the supplied dataset. Confirm provenance, representativeness, and independent validation before use."
        ),
    }
    artifact = {
        "pipeline": pipeline,
        "features": FEATURES,
        "report": report,
        "metrics": {
            "mae": scores["mae_kg_ha"],
            "rmse": scores["rmse_kg_ha"],
            "r2": scores["r2_score"],
            "mape_percent": scores["mape_percent"],
            "train_rows": report["dataset"]["training_rows"],
            "test_rows": report["dataset"]["test_rows"],
            "dataset_rows": report["dataset"]["usable_rows"],
            "evaluated_at": report["evaluated_at"],
        },
        "data_source": report["data_source"],
    }
    model_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, model_path)
    metrics_path.write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser(description="Train and evaluate the oilseed yield model.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="Training CSV path")
    parser.add_argument("--output", type=Path, default=DEFAULT_MODEL, help="Model output path")
    parser.add_argument(
        "--metrics-output",
        type=Path,
        default=ROOT / "models" / "model_metrics.json",
        help="Evaluation report output path",
    )
    parser.add_argument(
        "--source-description",
        help="Dataset source name and citation/URL to include in the saved report",
    )
    args = parser.parse_args()
    report = train(args.data, args.output, args.metrics_output, args.source_description)
    print(json.dumps(report, indent=2, allow_nan=False))
    print(f"Saved pipeline to {args.output}")
    print(f"Saved evaluation report to {args.metrics_output}")


if __name__ == "__main__":
    main()
