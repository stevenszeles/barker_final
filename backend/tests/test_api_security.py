from fastapi.testclient import TestClient

from backend.app.config import settings
from backend.app.main import app


def test_protected_api_login_and_readiness(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "db_url", "")
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "api.db"))
    monkeypatch.setattr(settings, "migrate_on_startup", True)
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "auth_secret", "test-secret-with-sufficient-entropy")
    monkeypatch.setattr(settings, "admin_password", "correct-admin-password")
    monkeypatch.setattr(settings, "viewer_password", "correct-viewer-password")
    monkeypatch.setattr(settings, "secure_cookies", False)

    with TestClient(app) as client:
        assert client.get("/health/ready").status_code == 200
        assert client.get("/api/portfolio/accounts").status_code == 401
        assert client.post("/api/session/login", json={"password": "wrong"}).status_code == 401

        login = client.post("/api/session/login", json={"password": "correct-viewer-password"})
        assert login.status_code == 200
        assert login.json()["role"] == "viewer"
        assert client.get("/api/portfolio/accounts").status_code == 200
        assert client.get("/api/admin/import-history").status_code == 403

        client.post("/api/session/logout")
        admin_login = client.post("/api/session/login", json={"password": "correct-admin-password"})
        assert admin_login.status_code == 200
        assert admin_login.json()["role"] == "admin"
        assert client.get("/api/admin/import-history").status_code == 200
