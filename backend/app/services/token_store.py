from typing import Optional, Dict, Any
import time

from ..db import with_conn


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
            "access_token": row[0],
            "refresh_token": row[1],
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
            (provider, access_token, refresh_token, expires_at, scope),
        )
        conn.commit()

    with_conn(_run)


def clear_token(provider: str) -> None:
    def _run(conn):
        cur = conn.cursor()
        cur.execute("DELETE FROM oauth_tokens WHERE provider=?", (provider,))
        conn.commit()

    with_conn(_run)
