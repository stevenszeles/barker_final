import logging
import threading

from .services import legacy_engine as engine

logger = logging.getLogger(__name__)


def _warmup_background() -> None:
    try:
        engine.warm_position_history_cache()
        logger.info("Initial history warmup complete.")
    except Exception as exc:
        logger.warning("Initial history warmup failed: %s", exc)
    try:
        engine.start_background_price_updates()
    except Exception as exc:
        logger.warning("Background price updates failed to start: %s", exc)


def start_workers(interval_seconds: int = 30):
    # Keep startup path non-blocking for Render health checks.
    _ = interval_seconds
    t = threading.Thread(target=_warmup_background, daemon=True, name="warmup-thread")
    t.start()
