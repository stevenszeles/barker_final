import logging
import time
from html import escape
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from fastapi.responses import HTMLResponse
from ..config import settings
from ..security import Identity, create_oauth_state, require_admin, verify_oauth_state
from ..services import schwab
from ..services.token_store import get_token, clear_token

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


class CodePayload(BaseModel):
    code: str


def _normalize_code(raw: str) -> str:
    return schwab.sanitize_auth_code(raw)


@router.get("/schwab/start")
def schwab_start(identity: Identity = Depends(require_admin)):
    if not settings.schwab.client_id or not settings.schwab.redirect_uri:
        raise HTTPException(status_code=400, detail="Schwab client config missing")
    state = create_oauth_state(identity)
    url = schwab.get_auth_url(state)
    return {"auth_url": url}


@router.get("/schwab/callback")
def schwab_callback(code: str, state: str, request: Request):
    verify_oauth_state(state)
    raw_code = code
    code = _normalize_code(code)
    if not code:
        raise HTTPException(status_code=400, detail="Missing auth code")
    try:
        schwab.exchange_code(code)
        status_msg = "<p style='color:#3ecf8e'>Token exchange succeeded. You can close this tab.</p>"
    except Exception as exc:
        logger.exception("Schwab OAuth exchange failed")
        status_msg = "<p style='color:#f4b2b2'>Auto-exchange failed. Return to the application and try again.</p>"

    return HTMLResponse(
        "<html><body>"
        "<h3>Schwab authorization received.</h3>"
        f"{status_msg}"
        "<p>Copy this code and paste it into the app's Schwab modal if needed:</p>"
        f"<pre>{escape(code)}</pre>"
        "<p style='color:#777;font-size:12px'>If exchange fails, copy the raw code below instead:</p>"
        f"<pre style='font-size:12px'>{escape(raw_code)}</pre>"
        "<p>You can close this tab after copying.</p>"
        "</body></html>"
    )


@router.post("/schwab/exchange")
def schwab_exchange(payload: CodePayload, _identity: Identity = Depends(require_admin)):
    code = _normalize_code(payload.code)
    if not code:
        raise HTTPException(status_code=400, detail="Missing auth code")
    try:
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
    }


@router.post("/schwab/logout")
def schwab_logout():
    clear_token("schwab")
    return {"ok": True}
