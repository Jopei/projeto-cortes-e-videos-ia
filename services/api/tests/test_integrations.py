from __future__ import annotations

import urllib.error

from app.config import get_settings


def test_integrations_requires_auth(client):
    assert client.get("/api/admin/integrations").status_code == 401


def test_integrations_requires_admin(logged_in_client):
    assert logged_in_client.get("/api/admin/integrations").status_code == 403
    assert logged_in_client.get("/api/admin/integrations/youtube").status_code == 403
    assert logged_in_client.put("/api/admin/integrations/youtube", json={"values": {}}).status_code == 403
    assert logged_in_client.delete("/api/admin/integrations/youtube").status_code == 403
    assert logged_in_client.post("/api/admin/integrations/youtube/test").status_code == 403


def test_integrations_list_has_all_nine(admin_client):
    resp = admin_client.get("/api/admin/integrations")
    assert resp.status_code == 200
    ids = {item["id"] for item in resp.json()}
    assert ids == {"youtube", "tiktok", "instagram", "facebook", "bilibili", "vimeo", "anthropic", "elevenlabs", "openai"}


def test_integrations_unknown_id_404(admin_client):
    assert admin_client.get("/api/admin/integrations/nope").status_code == 404
    assert admin_client.put("/api/admin/integrations/nope", json={"values": {}}).status_code == 404
    assert admin_client.delete("/api/admin/integrations/nope").status_code == 404
    assert admin_client.post("/api/admin/integrations/nope/test").status_code == 404


def test_integrations_env_only_source_and_configured(admin_client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "youtube_client_id", "env-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "youtube_client_secret", "env-secret-value")

    resp = admin_client.get("/api/admin/integrations/youtube")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "env"
    assert body["configured"] is True
    assert body["values"]["client_id"] == "env-client-id.apps.googleusercontent.com"
    assert body["values"]["client_secret"] == "••••alue"
    assert body["updated_at"] is None
    assert body["updated_by"] is None
    assert body["redirect_uri"] == f"{settings.public_api_url}/api/accounts/youtube/callback"


def test_integrations_anthropic_has_no_redirect(admin_client):
    body = admin_client.get("/api/admin/integrations/anthropic").json()
    assert body["redirect_uri"] is None


def test_integrations_bilibili_configured_without_any_value(admin_client):
    # Both bilibili fields are optional/futuro (required=False) — configured
    # is vacuously true even with nothing set.
    body = admin_client.get("/api/admin/integrations/bilibili").json()
    assert body["configured"] is True
    assert body["source"] is None


def test_integrations_not_configured_when_required_missing(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "youtube_client_id", None)
    monkeypatch.setattr(get_settings(), "youtube_client_secret", None)
    body = admin_client.get("/api/admin/integrations/youtube").json()
    assert body["configured"] is False
    assert body["source"] is None
    assert body["values"] == {"client_id": None, "client_secret": None}


def test_integrations_put_sets_db_value_over_env(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "youtube_client_id", "env-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(get_settings(), "youtube_client_secret", "env-secret-value")

    resp = admin_client.put(
        "/api/admin/integrations/youtube",
        json={"values": {"client_id": "db-client-id.apps.googleusercontent.com"}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["values"]["client_id"] == "db-client-id.apps.googleusercontent.com"
    # client_secret untouched by the partial PUT -> still falls back to env.
    assert body["values"]["client_secret"] == "••••alue"
    assert body["source"] == "mixed"
    assert body["updated_at"] is not None
    assert body["updated_by"] == "root-admin"


def test_integrations_put_strips_whitespace(admin_client):
    resp = admin_client.put(
        "/api/admin/integrations/anthropic",
        json={"values": {"api_key": "  sk-ant-abcdef1234  "}},
    )
    assert resp.status_code == 200
    assert resp.json()["values"]["api_key"] == "••••1234"


def test_integrations_put_empty_string_clears_db_value(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "env-fallback-key")
    admin_client.put("/api/admin/integrations/anthropic", json={"values": {"api_key": "db-key-value"}})
    resp = admin_client.put("/api/admin/integrations/anthropic", json={"values": {"api_key": ""}})
    assert resp.status_code == 200
    body = resp.json()
    # cleared -> falls back to env again.
    assert body["values"]["api_key"] == "••••-key"
    assert body["source"] == "env"


def test_integrations_put_null_clears_db_value(admin_client):
    admin_client.put("/api/admin/integrations/anthropic", json={"values": {"api_key": "db-key-value"}})
    resp = admin_client.put("/api/admin/integrations/anthropic", json={"values": {"api_key": None}})
    assert resp.status_code == 200
    assert resp.json()["values"]["api_key"] is None
    assert resp.json()["source"] is None


def test_integrations_put_unknown_key_is_422(admin_client):
    resp = admin_client.put("/api/admin/integrations/youtube", json={"values": {"totally_unknown": "x"}})
    assert resp.status_code == 422


def test_integrations_delete_clears_everything(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "env-fallback-key")
    admin_client.put("/api/admin/integrations/anthropic", json={"values": {"api_key": "db-key-value"}})
    resp = admin_client.delete("/api/admin/integrations/anthropic")
    assert resp.status_code == 204

    body = admin_client.get("/api/admin/integrations/anthropic").json()
    assert body["source"] == "env"
    assert body["values"]["api_key"] == "••••-key"


def test_integrations_audit_log_has_no_secret_values(admin_client):
    admin_client.put("/api/admin/integrations/anthropic", json={"values": {"api_key": "super-secret-value"}})
    admin_client.put("/api/admin/integrations/anthropic", json={"values": {"api_key": None}})

    entries = admin_client.get("/api/audit-log").json()
    update_entries = [e for e in entries if e["action"] == "integration.update"]
    clear_entries = [e for e in entries if e["action"] == "integration.clear"]
    assert update_entries and update_entries[0]["details"] == {"integration_id": "anthropic", "keys": ["api_key"]}
    assert clear_entries and clear_entries[0]["details"] == {"integration_id": "anthropic", "keys": ["api_key"]}

    dump = str(entries)
    assert "super-secret-value" not in dump


def test_platforms_configured_reflects_integration_settings(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "youtube_client_id", None)
    monkeypatch.setattr(get_settings(), "youtube_client_secret", None)

    platforms = {p["id"]: p for p in admin_client.get("/api/platforms").json()}
    assert platforms["youtube"]["configured"] is False

    admin_client.put(
        "/api/admin/integrations/youtube",
        json={
            "values": {
                "client_id": "db-client-id.apps.googleusercontent.com",
                "client_secret": "db-secret",
            }
        },
    )
    platforms = {p["id"]: p for p in admin_client.get("/api/platforms").json()}
    assert platforms["youtube"]["configured"] is True


def test_platforms_includes_vimeo(admin_client):
    platforms = {p["id"]: p for p in admin_client.get("/api/platforms").json()}
    assert platforms["vimeo"] == {
        "id": "vimeo",
        "name": "Vimeo",
        "supports_oauth": True,
        "configured": False,
        "notes": "Vimeo API (upload via tus). Monetização no Vimeo não é por anúncios.",
    }


def test_integration_test_vimeo_missing_required(admin_client):
    resp = admin_client.post("/api/admin/integrations/vimeo/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "Faltando" in body["message"]


def test_integration_test_vimeo_invalid_client_id_format(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "vimeo_client_id", "not-hex")
    monkeypatch.setattr(get_settings(), "vimeo_client_secret", "some-secret")
    resp = admin_client.post("/api/admin/integrations/vimeo/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "Vimeo" in body["message"]


def test_integration_test_vimeo_success(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "vimeo_client_id", "a" * 40)
    monkeypatch.setattr(get_settings(), "vimeo_client_secret", "some-secret")

    class _FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(
        "app.routers.admin_integrations.urllib.request.urlopen", lambda req, timeout=10: _FakeResponse()
    )

    resp = admin_client.post("/api/admin/integrations/vimeo/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert "sucesso" in body["message"].lower() or "sucedida" in body["message"].lower()


def test_integration_test_vimeo_invalid_credentials(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "vimeo_client_id", "a" * 40)
    monkeypatch.setattr(get_settings(), "vimeo_client_secret", "some-secret")

    def _raise_401(req, timeout=10):
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", hdrs=None, fp=None)

    monkeypatch.setattr("app.routers.admin_integrations.urllib.request.urlopen", _raise_401)

    resp = admin_client.post("/api/admin/integrations/vimeo/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "inválidas" in body["message"].lower() or "401" in body["message"]


def test_integration_test_generic_missing_required(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "tiktok_client_key", None)
    monkeypatch.setattr(get_settings(), "tiktok_client_secret", None)
    resp = admin_client.post("/api/admin/integrations/tiktok/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "Faltando" in body["message"]


def test_integration_test_youtube_format_validation(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "youtube_client_id", "not-a-google-client-id")
    monkeypatch.setattr(get_settings(), "youtube_client_secret", "some-secret")
    resp = admin_client.post("/api/admin/integrations/youtube/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False

    monkeypatch.setattr(get_settings(), "youtube_client_id", "abc123.apps.googleusercontent.com")
    resp = admin_client.post("/api/admin/integrations/youtube/test")
    body = resp.json()
    assert body["ok"] is True
    assert "Conectar" in body["message"]


def test_integration_test_anthropic_missing_key(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "anthropic_api_key", None)
    resp = admin_client.post("/api/admin/integrations/anthropic/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "não configurada" in body["message"]


def test_integration_test_anthropic_success(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "sk-ant-fake-key")

    class _FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    monkeypatch.setattr(
        "app.routers.admin_integrations.urllib.request.urlopen", lambda req, timeout=10: _FakeResponse()
    )

    resp = admin_client.post("/api/admin/integrations/anthropic/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert "sucesso" in body["message"].lower() or "sucedida" in body["message"].lower()


def test_integration_test_anthropic_invalid_key(admin_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "sk-ant-fake-key")

    def _raise_401(req, timeout=10):
        raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", hdrs=None, fp=None)

    monkeypatch.setattr("app.routers.admin_integrations.urllib.request.urlopen", _raise_401)

    resp = admin_client.post("/api/admin/integrations/anthropic/test")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "inválida" in body["message"].lower() or "401" in body["message"]
