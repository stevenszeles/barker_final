import logging
import time
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from fastapi.responses import HTMLResponse
import secrets

from ..config import settings
from ..services import schwab
from ..services.token_store import get_token, clear_token

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


class CodePayload(BaseModel):
    code: str


def _normalize_code(raw: str) -> str:
    return schwab.sanitize_auth_code(raw)


@router.get("/schwab/start")
def schwab_start():
    if not settings.schwab.client_id or not settings.schwab.redirect_uri:
        raise HTTPException(status_code=400, detail="Schwab client config missing")
    state = secrets.token_urlsafe(12)
    url = schwab.get_auth_url(state)
    return {"auth_url": url}


@router.get("/schwab/callback")
def schwab_callback(code: str, request: Request):
    raw_code = code
    code = _normalize_code(code)
    if not code:
        raise HTTPException(status_code=400, detail="Missing auth code")
    try:
        clear_token("schwab")
        schwab.exchange_code(code)
        status_msg = "<p style='color:#3ecf8e'>Token exchange succeeded. You can close this tab.</p>"
    except Exception as exc:
        status_msg = f"<p style='color:#f4b2b2'>Auto-exchange failed: {exc}</p>"

    return HTMLResponse(
        "<html><body>"
        "<h3>Schwab authorization received.</h3>"
        f"{status_msg}"
        "<p>Copy this code and paste it into the app's Schwab modal if needed:</p>"
        f"<pre>{code}</pre>"
        "<p style='color:#777;font-size:12px'>If exchange fails, copy the raw code below instead:</p>"
        f"<pre style='font-size:12px'>{raw_code}</pre>"
        "<p>You can close this tab after copying.</p>"
        "</body></html>"
    )


@router.post("/schwab/exchange")
def schwab_exchange(payload: CodePayload):
    code = _normalize_code(payload.code)
    if not code:
        raise HTTPException(status_code=400, detail="Missing auth code")
    try:
        clear_token("schwab")
        schwab.exchange_code(code)
        return {"ok": True}
    except Exception as exc:
        detail = str(exc)
        raise HTTPException(status_code=400, detail=detail) from exc


@router.get("/schwab/status")
def schwab_status():
    token = get_token("schwab")
    expires_at = token.get("expires_at") if token else None
    connected = bool(token and token.get("access_token"))
    if expires_at and expires_at <= int(time.time()):
        connected = False
    return {
        "connected": connected,
        "expires_at": expires_at,
        "scope": token.get("scope") if token else None,
    }


@router.get("/schwab/diagnostics")
def schwab_diagnostics():
    token = get_token("schwab")
    return {
        "client_id_set": bool(settings.schwab.client_id),
        "client_secret_set": bool(settings.schwab.client_secret),
        "redirect_uri": settings.schwab.redirect_uri,
        "connected": bool(token),
        "expires_at": token.get("expires_at") if token else None,
        "scope": token.get("scope") if token else None,
        "demo_mode": settings.demo_mode,
    }


@router.post("/schwab/logout")
def schwab_logout():
    clear_token("schwab")
    return {"ok": True}
