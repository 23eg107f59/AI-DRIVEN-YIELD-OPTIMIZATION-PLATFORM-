import hmac
import logging
import os
from pathlib import Path
import socket

from flask import Flask, Response, jsonify, request, send_from_directory

from backend.database import initialize_database
from backend.routes import api
from backend.sync_scheduler import start_sync_scheduler

ROOT = Path(__file__).resolve().parent


def _environment_bool(name, default):
    value = os.environ.get(name)
    if value is None:
        return default
    normalized = value.strip().casefold()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean value.")


def _environment_positive_int(name, default):
    value = os.environ.get(name, str(default))
    try:
        result = int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a positive integer.") from exc
    if result < 1:
        raise ValueError(f"{name} must be a positive integer.")
    return result


def _lan_ipv4_address():
    """Return the IPv4 address chosen for outbound network traffic, if available."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("192.0.2.1", 80))
            address = probe.getsockname()[0]
        return address if not address.startswith("127.") else None
    except OSError:
        return None


def create_app(test_config=None):
    app = Flask(__name__, static_folder="frontend", static_url_path="/static")
    app.config.from_mapping(
        DATABASE=os.environ.get(
            "OILSEED_DATABASE_PATH", str(ROOT / "instance" / "oilseed_ai.db")
        ),
        MODEL_PATH=os.environ.get(
            "OILSEED_MODEL_PATH", str(ROOT / "models" / "yield_pipeline.joblib")
        ),
        HOST=os.environ.get("HOST", "0.0.0.0"),
        PORT=_environment_positive_int("PORT", 5000),
        MAX_CONTENT_LENGTH=32 * 1024,
        AUTH_REQUIRED=_environment_bool("OILSEED_AUTH_REQUIRED", False),
        AUTH_USERNAME=os.environ.get("OILSEED_AUTH_USERNAME", ""),
        AUTH_PASSWORD=os.environ.get("OILSEED_AUTH_PASSWORD", ""),
        AGRICULTURE_AUTO_SYNC=_environment_bool("OILSEED_AUTO_SYNC", True),
        AGRICULTURE_SYNC_ON_STARTUP=_environment_bool("OILSEED_SYNC_ON_STARTUP", True),
        AGRICULTURE_SYNC_INTERVAL_HOURS=_environment_positive_int("OILSEED_SYNC_INTERVAL_HOURS", 24),
        AGRICULTURE_REQUEST_TIMEOUT_SECONDS=_environment_positive_int("OILSEED_REQUEST_TIMEOUT_SECONDS", 20),
    )
    if test_config:
        app.config.update(test_config)
    if app.config["AGRICULTURE_SYNC_INTERVAL_HOURS"] < 1:
        raise ValueError("AGRICULTURE_SYNC_INTERVAL_HOURS must be a positive integer.")
    if app.config["AGRICULTURE_REQUEST_TIMEOUT_SECONDS"] < 1:
        raise ValueError("AGRICULTURE_REQUEST_TIMEOUT_SECONDS must be a positive integer.")
    if app.config["PORT"] > 65535:
        raise ValueError("PORT must not exceed 65535.")
    if app.config["AUTH_REQUIRED"] and not (
        app.config["AUTH_USERNAME"] and app.config["AUTH_PASSWORD"]
    ):
        raise ValueError(
            "OILSEED_AUTH_USERNAME and OILSEED_AUTH_PASSWORD are required when "
            "OILSEED_AUTH_REQUIRED is enabled."
        )

    logging.basicConfig(level=logging.INFO)
    initialize_database(app.config["DATABASE"])
    app.register_blueprint(api, url_prefix="/api")

    @app.before_request
    def require_configured_authentication():
        if not app.config["AUTH_REQUIRED"]:
            return None
        credentials = request.authorization
        username_matches = hmac.compare_digest(
            credentials.username if credentials else "",
            app.config["AUTH_USERNAME"],
        )
        password_matches = hmac.compare_digest(
            credentials.password if credentials else "",
            app.config["AUTH_PASSWORD"],
        )
        if username_matches and password_matches:
            return None
        response = jsonify({"error": "Authentication is required to access Oilseed AI."})
        response.status_code = 401
        response.headers["WWW-Authenticate"] = 'Basic realm="Oilseed AI", charset="UTF-8"'
        return response

    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/data/README.md")
    def dataset_documentation():
        return send_from_directory(ROOT / "data", "README.md")

    @app.get("/<path:asset_path>")
    def frontend_asset(asset_path):
        return send_from_directory(app.static_folder, asset_path)

    @app.errorhandler(413)
    def request_too_large(_error):
        return jsonify({"error": "Request body is too large."}), 413

    start_sync_scheduler(app)
    return app


if __name__ == "__main__":
    application = create_app()
    host = application.config["HOST"]
    port = application.config["PORT"]
    logging.getLogger(__name__).info(
        "Starting Oilseed AI with debug mode disabled (host=%s, port=%s)",
        host,
        port,
    )
    logging.getLogger(__name__).info("Local URL: http://localhost:%s", port)
    lan_address = _lan_ipv4_address()
    if lan_address:
        logging.getLogger(__name__).info(
            "Same-Wi-Fi URL: http://%s:%s", lan_address, port
        )
    else:
        logging.getLogger(__name__).info(
            "Could not detect a LAN IPv4 address. Run `ipconfig` and use the "
            "IPv4 Address under your active Wi-Fi adapter."
        )
    application.run(host=host, port=port, debug=False)
