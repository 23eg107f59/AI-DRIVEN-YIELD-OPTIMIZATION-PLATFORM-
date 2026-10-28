import json
import logging
import math
import sqlite3
from datetime import date
import re

from flask import Blueprint, current_app, jsonify, request

from backend.agriculture_importer import start_manual_synchronization
from backend.agriculture_sources import SOURCES, UNVERIFIED_SOURCES
from backend.database import connect
from backend.prediction import ModelUnavailableError, load_artifact, predict_yield
from backend.recommendations import generate_recommendations

api = Blueprint("api", __name__)
logger = logging.getLogger(__name__)

CROPS = ["Groundnut", "Mustard", "Soybean", "Sunflower", "Sesame", "Rapeseed"]
SEASONS = ["Kharif", "Rabi", "Summer"]
SOILS = ["Alluvial", "Black", "Clay", "Clay loam", "Loamy", "Red", "Sandy", "Sandy loam"]
IRRIGATION = ["Canal", "Drip", "Flood irrigation", "Rainfed", "Sprinkler", "Tube well", "None"]
NUMERIC_LIMITS = {
    "area_ha": (0.01, 100000),
    "rainfall_mm": (0, 5000),
    "temperature_c": (-10, 60),
    "soil_ph": (0, 14),
    "nitrogen_kg_ha": (0, 1000),
    "phosphorus_kg_ha": (0, 1000),
    "potassium_kg_ha": (0, 1000),
    "fertilizer_kg_ha": (0, 5000),
    "previous_yield_kg_ha": (0, 30000),
}


def _error(message, status=400):
    return jsonify({"error": message}), status


def _number(payload, name, required=True):
    value = payload.get(name)
    if value is None or value == "":
        if not required:
            return None
        raise ValueError(f"{name.replace('_', ' ').capitalize()} is required.")
    if isinstance(value, bool):
        raise ValueError(f"{name.replace('_', ' ').capitalize()} must be a number.")
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name.replace('_', ' ').capitalize()} must be a number.")
    if not math.isfinite(number):
        raise ValueError(f"{name.replace('_', ' ').capitalize()} must be finite.")
    lower, upper = NUMERIC_LIMITS[name]
    if number < lower or number > upper:
        raise ValueError(
            f"{name.replace('_', ' ').capitalize()} must be between {lower:g} and {upper:g}."
        )
    return number


def _text(payload, name, allowed=None, required=True, maximum=100):
    value = payload.get(name)
    if value is None or (isinstance(value, str) and not value.strip()):
        if not required:
            return None
        raise ValueError(f"{name.replace('_', ' ').capitalize()} is required.")
    if not isinstance(value, str):
        raise ValueError(f"{name.replace('_', ' ').capitalize()} must be text.")
    value = value.strip()
    if len(value) > maximum:
        raise ValueError(f"{name.replace('_', ' ').capitalize()} must be {maximum} characters or fewer.")
    if any(ord(character) < 32 for character in value):
        raise ValueError(f"{name.replace('_', ' ').capitalize()} contains invalid characters.")
    if allowed is not None and value not in allowed:
        raise ValueError(f"Select a valid {name.replace('_', ' ')}.")
    return value


def validate_prediction(payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    values = {
        "crop": _text(payload, "crop", CROPS),
        "region": _text(payload, "region", maximum=100),
        "season": _text(payload, "season", SEASONS),
        "area_ha": _number(payload, "area_ha"),
        "rainfall_mm": _number(payload, "rainfall_mm"),
        "temperature_c": _number(payload, "temperature_c"),
        "soil_type": _text(payload, "soil_type", SOILS),
        "soil_ph": _number(payload, "soil_ph"),
        "nitrogen_kg_ha": _number(payload, "nitrogen_kg_ha"),
        "phosphorus_kg_ha": _number(payload, "phosphorus_kg_ha"),
        "potassium_kg_ha": _number(payload, "potassium_kg_ha"),
        "irrigation": _text(payload, "irrigation", IRRIGATION),
        "seed_variety": _text(payload, "seed_variety", maximum=100),
        "fertilizer_kg_ha": _number(payload, "fertilizer_kg_ha"),
        "previous_yield_kg_ha": _number(payload, "previous_yield_kg_ha", required=False),
    }
    return values


def validate_recommendation_inputs(payload):
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    return {
        "crop": _text(payload, "crop", CROPS),
        "season": _text(payload, "season", SEASONS),
        "rainfall_mm": _number(payload, "rainfall_mm"),
        "temperature_c": _number(payload, "temperature_c"),
        "soil_ph": _number(payload, "soil_ph"),
        "nitrogen_kg_ha": _number(payload, "nitrogen_kg_ha"),
        "phosphorus_kg_ha": _number(payload, "phosphorus_kg_ha"),
        "potassium_kg_ha": _number(payload, "potassium_kg_ha"),
        "irrigation": _text(payload, "irrigation", IRRIGATION),
    }


def _parse_date(value, name):
    if not value:
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        raise ValueError(f"{name} must be a date in YYYY-MM-DD format.")


def _history_filters():
    clauses = []
    params = []
    crop = request.args.get("crop", "").strip()
    if crop:
        if crop not in CROPS:
            raise ValueError("Select a valid crop filter.")
        clauses.append("crop = ?")
        params.append(crop)
    start = _parse_date(request.args.get("from"), "From date")
    end = _parse_date(request.args.get("to"), "To date")
    if start:
        clauses.append("date(created_at) >= date(?)")
        params.append(start)
    if end:
        clauses.append("date(created_at) <= date(?)")
        params.append(end)
    if start and end and start > end:
        raise ValueError("From date must be on or before To date.")
    search = request.args.get("search", "").strip()
    if len(search) > 100:
        raise ValueError("Search text must be 100 characters or fewer.")
    if search:
        clauses.append("(region LIKE ? OR crop LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    order = request.args.get("sort", "newest")
    sort_columns = {
        "newest": "created_at DESC, id DESC",
        "oldest": "created_at ASC, id ASC",
        "yield_desc": "predicted_yield_kg_ha DESC, id DESC",
        "yield_asc": "predicted_yield_kg_ha ASC, id ASC",
    }
    if order not in sort_columns:
        raise ValueError("Select a valid sort order.")
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return where, params, sort_columns[order]


def _agriculture_filters():
    clauses = ["category = 'official_regional'"]
    params = []
    for key, column in (
        ("crop", "crop"),
        ("state", "state"),
        ("district", "district"),
        ("season", "season"),
    ):
        value = request.args.get(key, "").strip()
        if value:
            if len(value) > 100 or any(ord(character) < 32 for character in value):
                raise ValueError(f"{key.capitalize()} filter is invalid.")
            clauses.append(f"{column} = ?")
            params.append(value)
    year = request.args.get("year", "").strip()
    if year:
        if not re.fullmatch(r"\d{4}-\d{2,4}", year):
            raise ValueError("Year must use the crop-year format YYYY-YY.")
        clauses.append("crop_year = ?")
        params.append(year)
    return " AND ".join(clauses), params


def _agriculture_sync_summary(connection):
    latest = connection.execute(
        "SELECT * FROM agriculture_sync_runs ORDER BY id DESC LIMIT 1"
    ).fetchone()
    total_records = connection.execute(
        "SELECT COUNT(*) AS total FROM agriculture_records"
    ).fetchone()["total"]
    source_rows = connection.execute(
        "SELECT * FROM agriculture_source_state ORDER BY source_id"
    ).fetchall()
    source_states = {row["source_id"]: dict(row) for row in source_rows}
    sources = []
    for source in SOURCES:
        state = source_states.get(source["source_id"], {})
        sources.append(
            {
                **{key: source[key] for key in ("source_id", "name", "url", "access_method", "scope")},
                "configured": True,
                "status": state.get("status", "not_checked"),
                "error": state.get("error"),
                "last_checked_at": state.get("last_checked_at"),
                "last_successful_sync": state.get("last_successful_sync"),
                "record_count": state.get("record_count", 0),
            }
        )
    return {
        "status": latest["status"] if latest else "idle",
        "last_run_id": latest["id"] if latest else None,
        "last_started_at": latest["started_at"] if latest else None,
        "last_completed_at": latest["completed_at"] if latest else None,
        "last_successful_sync": max(
            (source["last_successful_sync"] for source in sources if source["last_successful_sync"]),
            default=None,
        ),
        "records_retrieved": latest["records_retrieved"] if latest else 0,
        "inserted": latest["inserted"] if latest else 0,
        "updated": latest["updated"] if latest else 0,
        "skipped": latest["skipped"] if latest else 0,
        "rejected": latest["rejected"] if latest else 0,
        "total_imported_records": total_records,
        "errors": latest["errors"].splitlines() if latest and latest["errors"] else [],
        "sources": sources,
    }


@api.get("/health")
def health():
    try:
        load_artifact(current_app.config["MODEL_PATH"])
        model_status = "ready"
    except ModelUnavailableError:
        model_status = "not_trained"
    return jsonify({"status": "ok", "model": model_status})


@api.get("/crops")
def crops():
    return jsonify({"crops": CROPS})


@api.get("/agriculture/sources")
def agriculture_sources():
    with connect(current_app.config["DATABASE"]) as connection:
        sync = _agriculture_sync_summary(connection)
    configured_ids = {source["source_id"] for source in SOURCES}
    unconfigured = [
        {
            **source,
            "configured": False,
            "status": "not_connected",
            "error": None,
            "record_count": 0,
        }
        for source in UNVERIFIED_SOURCES
        if source["source_id"] not in configured_ids
    ]
    return jsonify({"sources": sync["sources"] + unconfigured})


@api.post("/agriculture/sync")
def agriculture_sync():
    try:
        run_id = start_manual_synchronization(
            current_app.config["DATABASE"],
            timeout=current_app.config["AGRICULTURE_REQUEST_TIMEOUT_SECONDS"],
        )
    except sqlite3.Error:
        logger.exception("Could not queue an agricultural synchronization")
        return _error("The synchronization job could not be queued. Please try again.", 500)
    if run_id is None:
        return _error("An agricultural data synchronization is already running.", 409)
    return jsonify({"id": run_id, "status": "queued", "message": "Agricultural data synchronization started."}), 202


@api.get("/agriculture/sync-status")
def agriculture_sync_status():
    with connect(current_app.config["DATABASE"]) as connection:
        return jsonify(_agriculture_sync_summary(connection))


@api.get("/agriculture/crops")
def agriculture_crops():
    with connect(current_app.config["DATABASE"]) as connection:
        rows = connection.execute(
            "SELECT DISTINCT crop FROM agriculture_records ORDER BY crop"
        ).fetchall()
    return jsonify({"crops": [row["crop"] for row in rows], "category": "official_regional"})


@api.get("/agriculture/history")
def agriculture_history():
    try:
        where, params = _agriculture_filters()
        limit = int(request.args.get("limit", "50"))
        offset = int(request.args.get("offset", "0"))
    except (TypeError, ValueError):
        return _error("History filters and pagination values must be valid.")
    if limit < 1 or limit > 100 or offset < 0:
        return _error("Limit must be 1-100 and offset must be non-negative.")

    with connect(current_app.config["DATABASE"]) as connection:
        total = connection.execute(
            f"SELECT COUNT(*) AS total FROM agriculture_records WHERE {where}", params
        ).fetchone()["total"]
        rows = connection.execute(
            f"""
            SELECT id, source_id, source_name, source_record_id, category, crop, state, district,
                   season, crop_year, area_ha, production_tonnes, yield_kg_ha,
                   calculated_yield_kg_ha, yield_discrepancy, verification_status,
                   publication_date, last_synced_at, created_at
            FROM agriculture_records WHERE {where}
            ORDER BY crop_year DESC, crop, state, source_name
            LIMIT ? OFFSET ?
            """,
            (*params, limit, offset),
        ).fetchall()
    return jsonify(
        {"records": [dict(row) for row in rows], "total": total, "limit": limit, "offset": offset}
    )


@api.get("/agriculture/statistics")
def agriculture_statistics():
    try:
        where, params = _agriculture_filters()
    except ValueError as exc:
        return _error(str(exc))
    with connect(current_app.config["DATABASE"]) as connection:
        summary = connection.execute(
            f"""
            SELECT COUNT(*) AS total_records, COUNT(DISTINCT crop) AS crop_count,
                   COUNT(DISTINCT state) AS state_count, MIN(crop_year) AS first_year,
                   MAX(crop_year) AS latest_year
            FROM agriculture_records WHERE {where}
            """,
            params,
        ).fetchone()
        trends = connection.execute(
            f"""
            SELECT crop, state, season, crop_year, source_id, source_name,
                   AVG(yield_kg_ha) AS yield_kg_ha, SUM(area_ha) AS area_ha,
                   SUM(production_tonnes) AS production_tonnes
            FROM agriculture_records WHERE {where}
            GROUP BY crop, state, season, crop_year, source_id, source_name
            ORDER BY crop_year, crop, state, source_id
            """,
            params,
        ).fetchall()
        sync = _agriculture_sync_summary(connection)
    return jsonify(
        {
            **dict(summary),
            "category": "official_regional",
            "filters": {
                key: request.args.get(key, "")
                for key in ("crop", "state", "district", "season", "year")
            },
            "last_successful_sync": sync["last_successful_sync"],
            "sync_status": sync["status"],
            "sources": sync["sources"],
            "errors": sync["errors"],
            "trends": [dict(row) for row in trends],
        }
    )


@api.post("/predict")
def predict():
    try:
        values = validate_prediction(request.get_json(silent=True))
        artifact = load_artifact(current_app.config["MODEL_PATH"])
        yield_estimate = round(predict_yield(artifact, values), 2)
        production = yield_estimate * values["area_ha"]
        with connect(current_app.config["DATABASE"]) as connection:
            cursor = connection.execute(
                """
                INSERT INTO predictions
                    (crop, region, season, area_ha, predicted_yield_kg_ha,
                     estimated_production_kg, input_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    values["crop"],
                    values["region"],
                    values["season"],
                    values["area_ha"],
                    yield_estimate,
                    production,
                    json.dumps(values),
                ),
            )
            prediction_id = cursor.lastrowid
            created_at = connection.execute(
                "SELECT created_at FROM predictions WHERE id = ?", (prediction_id,)
            ).fetchone()["created_at"]
        return jsonify(
            {
                "id": prediction_id,
                "crop": values["crop"],
                "region": values["region"],
                "predicted_yield_kg_ha": round(yield_estimate, 2),
                "predicted_yield_t_ha": round(yield_estimate / 1000, 3),
                "area_ha": values["area_ha"],
                "estimated_production_kg": round(production, 2),
                "estimated_production_t": round(production / 1000, 3),
                "created_at": created_at,
                "experimental": artifact.get("data_source") == "synthetic_demo",
                "notice": "This is an experimental estimate, not a guarantee. Actual yields depend on local conditions.",
            }
        ), 201
    except ValueError as exc:
        return _error(str(exc))
    except ModelUnavailableError as exc:
        return _error(str(exc), 503)
    except Exception:
        logger.exception("Prediction request failed")
        return _error("The prediction could not be completed. Please try again.", 500)


@api.get("/dashboard")
def dashboard():
    try:
        where, params, _ = _history_filters()
    except ValueError as exc:
        return _error(str(exc))
    with connect(current_app.config["DATABASE"]) as connection:
        rows = connection.execute(
            f"SELECT * FROM predictions {where} ORDER BY created_at DESC, id DESC",
            params,
        ).fetchall()
    records = [dict(row) for row in rows]
    total = len(records)
    average = sum(item["predicted_yield_kg_ha"] for item in records) / total if total else None
    counts = {}
    for item in records:
        counts[item["crop"]] = counts.get(item["crop"], 0) + 1
    most_selected = sorted(counts.items(), key=lambda entry: (-entry[1], entry[0]))[0][0] if counts else None
    crop_averages = {}
    for item in records:
        bucket = crop_averages.setdefault(item["crop"], [])
        bucket.append(item["predicted_yield_kg_ha"])
    return jsonify(
        {
            "total_predictions": total,
            "average_yield_kg_ha": round(average, 2) if average is not None else None,
            "most_selected_crop": most_selected,
            "crop_averages": [
                {"crop": crop, "yield_kg_ha": round(sum(values) / len(values), 2)}
                for crop, values in sorted(crop_averages.items())
            ],
            "crop_distribution": [
                {"crop": crop, "count": count} for crop, count in sorted(counts.items())
            ],
            "history": [
                {
                    "date": item["created_at"],
                    "yield_kg_ha": item["predicted_yield_kg_ha"],
                    "crop": item["crop"],
                }
                for item in reversed(records[-30:])
            ],
            "recent_predictions": records[:6],
        }
    )


@api.get("/history")
def history():
    try:
        where, params, order = _history_filters()
    except ValueError as exc:
        return _error(str(exc))
    with connect(current_app.config["DATABASE"]) as connection:
        rows = connection.execute(
            f"SELECT * FROM predictions {where} ORDER BY {order}", params
        ).fetchall()
    return jsonify({"predictions": [dict(row) for row in rows]})


@api.get("/history/<int:prediction_id>")
def history_detail(prediction_id):
    with connect(current_app.config["DATABASE"]) as connection:
        row = connection.execute(
            "SELECT * FROM predictions WHERE id = ?", (prediction_id,)
        ).fetchone()
    if row is None:
        return _error("Prediction not found.", 404)
    record = dict(row)
    record["inputs"] = json.loads(record.pop("input_json"))
    return jsonify(record)


@api.delete("/history/<int:prediction_id>")
def delete_history(prediction_id):
    with connect(current_app.config["DATABASE"]) as connection:
        cursor = connection.execute(
            "DELETE FROM predictions WHERE id = ?", (prediction_id,)
        )
    if cursor.rowcount == 0:
        return _error("Prediction not found.", 404)
    return jsonify({"deleted": True, "id": prediction_id})


@api.post("/recommendations")
def recommendations():
    try:
        values = validate_recommendation_inputs(request.get_json(silent=True))
    except ValueError as exc:
        return _error(str(exc))
    return jsonify(generate_recommendations(values))


@api.get("/model-metrics")
def model_metrics():
    try:
        artifact = load_artifact(current_app.config["MODEL_PATH"])
    except ModelUnavailableError as exc:
        return jsonify({
            "available": False,
            "error": str(exc),
            "model_name": None,
            "dataset_source": None,
            "dataset": None,
            "split": None,
            "metrics": None,
            "test_predictions": [],
            "crop_metrics": [],
        })
    report = artifact.get("report")
    if not isinstance(report, dict) or not isinstance(report.get("metrics"), dict):
        return jsonify({
            "available": False,
            "error": "The model has no complete held-out evaluation report. Retrain it to publish valid metrics.",
            "model_name": None,
            "dataset_source": None,
            "dataset": None,
            "split": None,
            "metrics": None,
            "test_predictions": [],
            "crop_metrics": [],
        })
    scores = report["metrics"]
    return jsonify({
        "available": True,
        "model_name": report["model_name"],
        "dataset_source": report["dataset_source"],
        "data_source": report["data_source"],
        "experimental": report["experimental"],
        "dataset": report["dataset"],
        "training_records": report["dataset"]["training_rows"],
        "test_records": report["dataset"]["test_rows"],
        "split": report["split"],
        "r2_score": scores["r2_score"],
        "mae_kg_ha": scores["mae_kg_ha"],
        "rmse_kg_ha": scores["rmse_kg_ha"],
        "mape_percent": scores["mape_percent"],
        "mape_rows": scores["mape_rows"],
        "evaluated_at": report["evaluated_at"],
        "metrics": {
            **scores,
            "r2": scores["r2_score"],
            "mae": scores["mae_kg_ha"],
            "rmse": scores["rmse_kg_ha"],
            "train_rows": report["dataset"]["training_rows"],
            "test_rows": report["dataset"]["test_rows"],
            "dataset_rows": report["dataset"]["usable_rows"],
            "evaluated_at": report["evaluated_at"],
        },
        "test_predictions": report.get("test_predictions", []),
        "crop_metrics": report.get("crop_metrics", []),
        "limitations": report.get("limitations"),
    })
