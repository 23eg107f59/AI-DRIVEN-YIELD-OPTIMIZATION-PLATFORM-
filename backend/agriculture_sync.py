import logging
import os
from pathlib import Path

from backend.agriculture_importer import run_synchronization
from backend.database import initialize_database

ROOT = Path(__file__).resolve().parents[1]
DATABASE = Path(os.environ.get("OILSEED_DATABASE_PATH", ROOT / "instance" / "oilseed_ai.db"))


def main():
    logging.basicConfig(level=logging.INFO)
    initialize_database(DATABASE)
    result = run_synchronization(
        DATABASE,
        timeout=int(os.environ.get("OILSEED_REQUEST_TIMEOUT_SECONDS", "20")),
    )
    if result is None:
        logging.error("Another agricultural synchronization is already running.")
        return 1
    logging.info(
        "Agricultural sync %s: %s retrieved, %s inserted, %s updated, %s skipped, %s rejected.",
        result["status"],
        result["retrieved"],
        result["inserted"],
        result["updated"],
        result["skipped"],
        result["rejected"],
    )
    return 0 if result["status"] != "failed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
