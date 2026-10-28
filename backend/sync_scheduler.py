import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from backend.agriculture_importer import run_synchronization

logger = logging.getLogger(__name__)


def start_sync_scheduler(app):
    if not app.config["AGRICULTURE_AUTO_SYNC"] or app.testing:
        return None

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        run_synchronization,
        trigger="interval",
        hours=app.config["AGRICULTURE_SYNC_INTERVAL_HOURS"],
        args=(app.config["DATABASE"], app.config["AGRICULTURE_REQUEST_TIMEOUT_SECONDS"]),
        id="agriculture-sync",
        name="Synchronize official regional agricultural data",
        max_instances=1,
        coalesce=True,
        next_run_time=(
            datetime.now(timezone.utc)
            if app.config["AGRICULTURE_SYNC_ON_STARTUP"]
            else None
        ),
        replace_existing=True,
    )
    scheduler.start()
    app.extensions["agriculture_scheduler"] = scheduler
    logger.info(
        "Agricultural data synchronization scheduler started (interval: %s hours)",
        app.config["AGRICULTURE_SYNC_INTERVAL_HOURS"],
    )
    return scheduler
