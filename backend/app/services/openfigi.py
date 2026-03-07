from __future__ import annotations

import logging
import re
from typing import Dict, List, Tuple

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

_FIGI_RE = re.compile(r"^BBG[0-9A-Z]{9}$")
_CLASS_SHARE_RE = re.compile(r"^([A-Z]{1,6})[./]([A-Z]{1,3})$")
_FIGI_TO_TICKER: Dict[str, str] = {}


def configured() -> bool:
    return bool(settings.openfigi.api_key)


def is_figi_symbol(symbol: str) -> bool:
    s = (symbol or "").strip().upper()
    return bool(s) and _FIGI_RE.match(s) is not None


def _mapping_url() -> str:
    return f"{settings.openfigi.base_url.rstrip('/')}/v3/mapping"


def _normalize_alias_symbol(symbol: str) -> str:
    s = (symbol or "").strip().upper()
    if not s:
        return s
    if s.startswith("$") and s not in {"$SPX"}:
        s = s[1:]
    m = _CLASS_SHARE_RE.match(s)
    if m:
        s = f"{m.group(1)}-{m.group(2)}"
    if s == "BRKB":
        return "BRK-B"
    if s == "BFB":
        return "BF-B"
    return s


def _resolve_figi_batch(figis: List[str]) -> Dict[str, str]:
    if not configured() or not figis:
        return {}
    headers = {
        "Content-Type": "application/json",
        "X-OPENFIGI-APIKEY": settings.openfigi.api_key,
    }
    payload = [{"idType": "ID_BB_GLOBAL", "idValue": figi} for figi in figis]
    try:
        with httpx.Client(timeout=settings.openfigi.timeout) as client:
            resp = client.post(_mapping_url(), headers=headers, json=payload)
            resp.raise_for_status()
            body = resp.json()
    except Exception as exc:
        logger.warning("OpenFIGI mapping request failed: %s", exc)
        return {}

    if not isinstance(body, list):
        return {}

    out: Dict[str, str] = {}
    for figi, item in zip(figis, body):
        if not isinstance(item, dict):
            continue
        data = item.get("data")
        if not isinstance(data, list):
            continue
        mapped = ""
        for candidate in data:
            if not isinstance(candidate, dict):
                continue
            ticker = _normalize_alias_symbol(str(candidate.get("ticker") or "").strip().upper())
            if ticker:
                mapped = ticker
                break
        if mapped:
            out[figi] = mapped
    return out


def resolve_symbol(symbol: str) -> str:
    s = _normalize_alias_symbol(symbol)
    if not s:
        return s
    if not is_figi_symbol(s):
        return s
    if s in _FIGI_TO_TICKER:
        return _FIGI_TO_TICKER[s]

    mapped = _resolve_figi_batch([s]).get(s, s)
    _FIGI_TO_TICKER[s] = mapped
    return mapped


def resolve_symbols(symbols: List[str]) -> Tuple[List[str], Dict[str, str]]:
    normalized = [_normalize_alias_symbol(s) for s in symbols if (s or "").strip()]
    if not normalized:
        return [], {}

    figis = [s for s in normalized if is_figi_symbol(s)]
    to_fetch = [s for s in figis if s not in _FIGI_TO_TICKER]

    if to_fetch and configured():
        chunk_size = 80
        for idx in range(0, len(to_fetch), chunk_size):
            chunk = to_fetch[idx : idx + chunk_size]
            resolved = _resolve_figi_batch(chunk)
            for figi in chunk:
                _FIGI_TO_TICKER[figi] = resolved.get(figi, figi)

    mapping: Dict[str, str] = {}
    resolved_list: List[str] = []
    for original in normalized:
        resolved = _FIGI_TO_TICKER.get(original, original) if is_figi_symbol(original) else original
        mapping[original] = resolved
        resolved_list.append(resolved)
    return resolved_list, mapping
