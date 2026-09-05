from typing import Optional, Dict, Any
import base64
import hashlib
import time

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings
from ..db import with_conn


def _fernet() -> Fernet:
    secret = settings.auth_secret or settings.schwab.client_secret or "local-development-token-key"
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def _encrypt(value: str) -> str:
    if not value:
        return ""
    return "enc:v1:" + _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def _decrypt(value: str) -> str:
    if not value:
        return ""
    if not value.startswith("enc:v1:"):
        # Backward-compatible read for existing installations. The next token
        # refresh rewrites it encrypted.
        return value
    try:
        return _fernet().decrypt(value.removeprefix("enc:v1:").encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise RuntimeError("Stored OAuth token cannot be decrypted with the configured application secret") from exc


def get_token(provider: str) -> Optional[Dict[str, Any]]:
    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            "SELECT access_token, refresh_token, expires_at, scope FROM oauth_tokens WHERE provider=?",
            (provider,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "access_token": _decrypt(row[0]),
            "refresh_token": _decrypt(row[1]),
            "expires_at": row[2],
            "scope": row[3],
        }

    return with_conn(_run)


def save_token(provider: str, access_token: str, refresh_token: str, expires_in: int, scope: Optional[str] = None) -> None:
    expires_at = int(time.time()) + int(expires_in)

    def _run(conn):
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO oauth_tokens(provider, access_token, refresh_token, expires_at, scope)
            VALUES(?,?,?,?,?)
            ON CONFLICT(provider) DO UPDATE SET access_token=excluded.access_token,
                refresh_token=excluded.refresh_token,
                expires_at=excluded.expires_at,
                scope=excluded.scope
            """,
            (provider, _encrypt(access_token), _encrypt(refresh_token), expires_at, scope),
        )
        conn.commit()

    with_conn(_run)


def clear_token(provider: str) -> None:
    def _run(conn):
        cur = conn.cursor()
        cur.execute("DELETE FROM oauth_tokens WHERE provider=?", (provider,))
        conn.commit()

    with_conn(_run)
