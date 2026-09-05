from __future__ import annotations

from collections import defaultdict
import threading
import time

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..config import settings
from ..security import SESSION_COOKIE, authenticate_password, create_session, get_identity

router = APIRouter(prefix="/session", tags=["session"])
_ATTEMPT_LOCK = threading.Lock()
_FAILED_ATTEMPTS: dict[str, list[float]] = defaultdict(list)
_ATTEMPT_WINDOW_SECONDS = 15 * 60
_ATTEMPT_LIMIT = 8


class LoginPayload(BaseModel):
    password: str = Field(min_length=1, max_length=512)


@router.get("")
def session_status(request: Request):
    if not settings.auth_enabled:
        return {"authenticated": True, "role": "admin", "subject": "local-development", "auth_enabled": False}
    try:
        identity = get_identity(request)
    except HTTPException:
        return {"authenticated": False, "role": None, "subject": None, "auth_enabled": True}
    return {
        "authenticated": True,
        "role": identity.role,
        "subject": identity.subject,
        "auth_enabled": True,
    }


@router.post("/login")
def login(payload: LoginPayload, request: Request, response: Response):
    if not settings.auth_enabled:
        return {"authenticated": True, "role": "admin", "subject": "local-development", "auth_enabled": False}
    client = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _ATTEMPT_LOCK:
        recent = [stamp for stamp in _FAILED_ATTEMPTS[client] if now - stamp < _ATTEMPT_WINDOW_SECONDS]
        _FAILED_ATTEMPTS[client] = recent
        if len(recent) >= _ATTEMPT_LIMIT:
            raise HTTPException(status_code=429, detail="Too many failed sign-in attempts. Try again later.")
    identity = authenticate_password(payload.password)
    if identity is None:
        with _ATTEMPT_LOCK:
            _FAILED_ATTEMPTS[client].append(now)
        raise HTTPException(status_code=401, detail="Invalid password")
    with _ATTEMPT_LOCK:
        _FAILED_ATTEMPTS.pop(client, None)
    response.set_cookie(
        SESSION_COOKIE,
        create_session(identity.role),
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=settings.session_hours * 3600,
        path="/",
    )
    return {
        "authenticated": True,
        "role": identity.role,
        "subject": identity.subject,
        "auth_enabled": True,
    }


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}
