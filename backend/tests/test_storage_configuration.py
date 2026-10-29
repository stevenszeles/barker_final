import pytest

from backend.app.config import settings, validate_storage_configuration
from backend.app.db import connect


@pytest.fixture(autouse=True)
def production(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "db_fallback_to_sqlite", False)


@pytest.mark.parametrize("url", [None, "", "sqlite:///temporary.db"])
def test_production_rejects_temporary_storage_before_connect(url, monkeypatch):
    monkeypatch.setattr(settings, "db_url", url)
    with pytest.raises(RuntimeError, match="PostgreSQL DATABASE_URL"):
        connect()


def test_production_rejects_fallback(monkeypatch):
    monkeypatch.setattr(settings, "db_url", "postgresql://example/barker")
    monkeypatch.setattr(settings, "db_fallback_to_sqlite", True)
    with pytest.raises(RuntimeError, match="WS_DB_FALLBACK_TO_SQLITE=0"):
        connect()


def test_production_accepts_postgres(monkeypatch):
    monkeypatch.setattr(settings, "db_url", "postgresql://example/barker")
    validate_storage_configuration()


def test_render_requires_postgres_without_environment_flag(monkeypatch):
    monkeypatch.delenv("ENVIRONMENT")
    monkeypatch.setenv("RENDER_SERVICE_ID", "test-service")
    monkeypatch.setattr(settings, "db_url", None)
    with pytest.raises(RuntimeError, match="PostgreSQL DATABASE_URL"):
        validate_storage_configuration()


def test_local_sqlite_survives_reconnect(tmp_path, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    for name in ("RENDER", "RENDER_SERVICE_ID", "RENDER_EXTERNAL_URL", "RENDER_EXTERNAL_HOSTNAME"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(settings, "db_url", None)
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "persistent.db"))
    conn = connect()
    conn.execute("CREATE TABLE persistence_check (value TEXT)")
    conn.execute("INSERT INTO persistence_check VALUES ('saved')")
    conn.commit()
    conn.close()
    conn = connect()
    assert conn.execute("SELECT value FROM persistence_check").fetchone()[0] == "saved"
    conn.close()
