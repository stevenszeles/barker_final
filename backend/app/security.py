from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from starlette.requests import HTTPConnection

from .config import settings

SESSION_COOKIE = "barker_session"


@dataclass(frozen=True)
class Identity:
    role: str
    subject: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def validate_security_configuration() -> None:
    if not settings.auth_enabled:
        return
    missing = []
    if not settings.auth_secret:
        missing.append("BARKER_AUTH_SECRET")
    if not settings.admin_password:
        missing.append("BARKER_ADMIN_PASSWORD")
    if missing:
        raise RuntimeError(f"Authentication is enabled but required settings are missing: {', '.join(missing)}")
    if len(settings.auth_secret) < 32:
        raise RuntimeError("BARKER_AUTH_SECRET must contain at least 32 characters")
    if len(settings.admin_password) < 12:
        raise RuntimeError("BARKER_ADMIN_PASSWORD must contain at least 12 characters")
    if settings.viewer_password and len(settings.viewer_password) < 12:
        raise RuntimeError("BARKER_VIEWER_PASSWORD must contain at least 12 characters")
    if settings.viewer_password and hmac.compare_digest(settings.viewer_password, settings.admin_password):
        raise RuntimeError("Administrator and viewer passwords must be different")


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def _secret() -> bytes:
    value = settings.auth_secret or "local-development-only"
    return value.encode("utf-8")


def _sign_payload(payload: dict[str, Any]) -> str:
    encoded = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = hmac.new(_secret(), encoded.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded}.{_b64encode(signature)}"


def _verify_payload(token: str, purpose: str) -> dict[str, Any]:
    try:
        encoded, supplied_signature = token.split(".", 1)
        expected_signature = hmac.new(_secret(), encoded.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64decode(supplied_signature), expected_signature):
            raise ValueError("signature mismatch")
        payload = json.loads(_b64decode(encoded))
        if payload.get("purpose") != purpose:
            raise ValueError("purpose mismatch")
        if int(payload.get("exp") or 0) <= int(time.time()):
            raise ValueError("expired")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Session is invalid or expired") from exc


def create_session(role: str) -> str:
    now = int(time.time())
    return _sign_payload(
        {
            "purpose": "session",
            "role": role,
            "sub": f"{role}-member",
            "iat": now,
            "exp": now + (settings.session_hours * 3600),
            "nonce": secrets.token_urlsafe(12),
        }
    )


def create_oauth_state(identity: Identity) -> str:
    now = int(time.time())
    return _sign_payload(
        {
            "purpose": "schwab-oauth",
            "role": identity.role,
            "sub": identity.subject,
            "iat": now,
            "exp": now + 600,
            "nonce": secrets.token_urlsafe(16),
        }
    )


def verify_oauth_state(state: str) -> None:
    _verify_payload(state, "schwab-oauth")


def authenticate_password(password: str) -> Identity | None:
    raw = password or ""
    if settings.admin_password and hmac.compare_digest(raw, settings.admin_password):
        return Identity(role="admin", subject="admin-member")
    if settings.viewer_password and hmac.compare_digest(raw, settings.viewer_password):
        return Identity(role="viewer", subject="viewer-member")
    return None


def get_identity(connection: HTTPConnection) -> Identity:
    if not settings.auth_enabled:
        return Identity(role="admin", subject="local-development")
    token = connection.cookies.get(SESSION_COOKIE, "")
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = _verify_payload(token, "session")
    role = str(payload.get("role") or "")
    if role not in {"viewer", "admin"}:
        raise HTTPException(status_code=403, detail="Invalid role")
    return Identity(role=role, subject=str(payload.get("sub") or role))


def require_viewer(connection: HTTPConnection) -> Identity:
    return get_identity(connection)


def require_admin(connection: HTTPConnection) -> Identity:
    identity = get_identity(connection)
    if not identity.is_admin:
        raise HTTPException(status_code=403, detail="Administrator access required")
    return identity
