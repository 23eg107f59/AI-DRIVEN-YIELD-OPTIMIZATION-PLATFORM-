import sqlite3
from pathlib import Path


def connect(database_path):
    path = Path(database_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(database_path):
    with connect(database_path) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crop TEXT NOT NULL,
                region TEXT NOT NULL,
                season TEXT NOT NULL,
                area_ha REAL NOT NULL,
                predicted_yield_kg_ha REAL NOT NULL,
                estimated_production_kg REAL NOT NULL,
                input_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS agriculture_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id TEXT NOT NULL,
                source_record_id TEXT NOT NULL,
                source_name TEXT NOT NULL,
                category TEXT NOT NULL CHECK (category = 'official_regional'),
                crop TEXT NOT NULL,
                state TEXT NOT NULL,
                district TEXT,
                season TEXT NOT NULL,
                crop_year TEXT NOT NULL,
                area_ha REAL CHECK (area_ha IS NULL OR area_ha >= 0),
                production_tonnes REAL CHECK (production_tonnes IS NULL OR production_tonnes >= 0),
                yield_kg_ha REAL CHECK (yield_kg_ha IS NULL OR yield_kg_ha >= 0),
                calculated_yield_kg_ha REAL,
                yield_discrepancy INTEGER NOT NULL DEFAULT 0 CHECK (yield_discrepancy IN (0, 1)),
                verification_status TEXT NOT NULL,
                publication_date TEXT,
                last_synced_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                UNIQUE (source_id, source_record_id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS agriculture_source_state (
                source_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                error TEXT,
                etag TEXT,
                last_modified TEXT,
                content_hash TEXT,
                record_count INTEGER NOT NULL DEFAULT 0,
                last_checked_at TEXT,
                last_successful_sync TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS agriculture_sync_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                records_retrieved INTEGER NOT NULL DEFAULT 0,
                inserted INTEGER NOT NULL DEFAULT 0,
                updated INTEGER NOT NULL DEFAULT 0,
                skipped INTEGER NOT NULL DEFAULT 0,
                rejected INTEGER NOT NULL DEFAULT 0,
                errors TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS agriculture_sync_locks (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                token TEXT NOT NULL,
                expires_at REAL NOT NULL
            )
            """
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_agriculture_filter "
            "ON agriculture_records (crop, state, district, season, crop_year)"
        )


def row_to_dict(row):
    return dict(row) if row is not None else None
