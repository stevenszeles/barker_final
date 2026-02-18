import logging

from .services import legacy_engine as engine

logger = logging.getLogger(__name__)


def start_workers(interval_seconds: int = 30):
    try:
        engine.warm_position_history_cache()
    except Exception as exc:
        logger.warning("Initial history warmup failed: %s", exc)
    try:
        engine.start_background_price_updates()
    except Exception as exc:
        logger.warning("Background price updates failed to start: %s", exc)
