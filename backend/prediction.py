from pathlib import Path

import joblib
import pandas as pd

FEATURES = [
    "crop",
    "region",
    "season",
    "rainfall_mm",
    "temperature_c",
    "soil_type",
    "soil_ph",
    "nitrogen_kg_ha",
    "phosphorus_kg_ha",
    "potassium_kg_ha",
    "irrigation",
    "seed_variety",
    "fertilizer_kg_ha",
    "previous_yield_kg_ha",
]


class ModelUnavailableError(RuntimeError):
    pass


def load_artifact(model_path):
    path = Path(model_path)
    if not path.is_file():
        raise ModelUnavailableError(
            "The yield model is not trained yet. Run: python -m backend.ml.train_model"
        )
    try:
        return joblib.load(path)
    except (OSError, EOFError, ValueError) as exc:
        raise ModelUnavailableError("The saved yield model could not be loaded.") from exc


def predict_yield(model, values):
    frame = pd.DataFrame([{key: values.get(key) for key in FEATURES}], columns=FEATURES)
    prediction = float(model["pipeline"].predict(frame)[0])
    return max(0.0, prediction)
