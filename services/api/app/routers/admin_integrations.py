"""Admin-only management of third-party integration credentials
(youtube/tiktok/instagram/facebook/bilibili/vimeo/anthropic) — lets an admin enter
these through the UI instead of only via `.env`. See `app/integrations.py`
for the registry + effective-value (DB-then-env) resolution used by every
other consumer (worker tasks, `GET /api/platforms`, future OAuth).

Secrets are never returned in clear: `GET`/list responses mask them
(`app.integrations.mask_secret`) and non-secret values are the only ones
echoed back verbatim. `PUT` accepts a partial `values` dict — omitted keys
are left untouched; `""`/`null` clears a key (deletes its DB row, falling
back to env again).
"""

from __future__ import annotations

import base64
import logging
import re
import urllib.error
import urllib.parse
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.audit import record_action
from app.db import get_db
from app.integrations import (
    INTEGRATIONS,
    get_effective_field,
    get_integration_def,
    get_integration_value,
    list_integrations,
    mask_secret,
)
from app.config import get_settings
from app.models.integration_setting import IntegrationSetting
from app.models.user import User
from app.scope import require_admin
from app.schemas.integration import IntegrationFieldRead, IntegrationRead, IntegrationTestResult, IntegrationUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/integrations", tags=["admin"], dependencies=[Depends(require_admin)])


def _build_read(db: Session, integration_id: str) -> IntegrationRead:
    definition = INTEGRATIONS[integration_id]
    rows = db.query(IntegrationSetting).filter(IntegrationSetting.integration_id == integration_id).all()
    rows_by_key = {row.key: row for row in rows}

    values: dict[str, str | None] = {}
    sources: set[str] = set()
    required_missing = False
    for f in definition.fields:
        value, source = get_effective_field(integration_id, f.key)
        if source is not None:
            sources.add(source)
        if f.required and not value:
            required_missing = True
        values[f.key] = mask_secret(value) if f.secret else value

    if not sources:
        overall_source = None
    elif len(sources) == 1:
        overall_source = next(iter(sources))
    else:
        overall_source = "mixed"

    latest_row = max(rows, key=lambda r: r.updated_at) if rows else None
    updated_by_name = None
    if latest_row is not None and latest_row.updated_by is not None:
        updated_user = db.get(User, latest_row.updated_by)
        updated_by_name = updated_user.username if updated_user is not None else None

    redirect_uri = None
    if definition.has_redirect:
        redirect_uri = f"{get_settings().public_api_url.rstrip('/')}/api/accounts/{integration_id}/callback"

    return IntegrationRead(
        id=definition.id,
        name=definition.name,
        fields=[IntegrationFieldRead(key=f.key, label=f.label, secret=f.secret, required=f.required) for f in definition.fields],
        values=values,
        configured=not required_missing,
        source=overall_source,
        redirect_uri=redirect_uri,
        updated_at=latest_row.updated_at if latest_row is not None else None,
        updated_by=updated_by_name,
    )


def _get_def_or_404(integration_id: str):
    definition = get_integration_def(integration_id)
    if definition is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    return definition


@router.get("", response_model=list[IntegrationRead])
def list_integration_settings(db: Session = Depends(get_db)) -> list[IntegrationRead]:
    return [_build_read(db, definition.id) for definition in list_integrations()]


@router.get("/{integration_id}", response_model=IntegrationRead)
def get_integration_settings(integration_id: str, db: Session = Depends(get_db)) -> IntegrationRead:
    _get_def_or_404(integration_id)
    return _build_read(db, integration_id)


@router.put("/{integration_id}", response_model=IntegrationRead)
def update_integration_settings(
    integration_id: str,
    payload: IntegrationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> IntegrationRead:
    definition = _get_def_or_404(integration_id)
    valid_keys = {f.key for f in definition.fields}
    unknown = set(payload.values.keys()) - valid_keys
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown field(s): {', '.join(sorted(unknown))}")

    from app.crypto import encrypt_token

    set_keys: list[str] = []
    cleared_keys: list[str] = []

    for key, raw_value in payload.values.items():
        value = raw_value.strip() if isinstance(raw_value, str) else raw_value
        row = (
            db.query(IntegrationSetting)
            .filter(IntegrationSetting.integration_id == integration_id, IntegrationSetting.key == key)
            .one_or_none()
        )
        if not value:
            if row is not None:
                db.delete(row)
                cleared_keys.append(key)
            continue
        if row is None:
            row = IntegrationSetting(integration_id=integration_id, key=key)
            db.add(row)
        row.value_encrypted = encrypt_token(value)
        row.updated_by = current_user.id
        set_keys.append(key)

    if set_keys:
        record_action(
            db,
            user_id=current_user.id,
            action="integration.update",
            entity="integration",
            entity_id=None,
            details={"integration_id": integration_id, "keys": sorted(set_keys)},
        )
    if cleared_keys:
        record_action(
            db,
            user_id=current_user.id,
            action="integration.clear",
            entity="integration",
            entity_id=None,
            details={"integration_id": integration_id, "keys": sorted(cleared_keys)},
        )

    db.commit()
    return _build_read(db, integration_id)


@router.delete("/{integration_id}", status_code=204)
def delete_integration_settings(
    integration_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Response:
    _get_def_or_404(integration_id)
    rows = db.query(IntegrationSetting).filter(IntegrationSetting.integration_id == integration_id).all()
    keys = sorted(row.key for row in rows)
    for row in rows:
        db.delete(row)
    if keys:
        record_action(
            db,
            user_id=current_user.id,
            action="integration.clear",
            entity="integration",
            entity_id=None,
            details={"integration_id": integration_id, "keys": keys},
        )
    db.commit()
    return Response(status_code=204)


def _test_anthropic() -> IntegrationTestResult:
    api_key = get_integration_value("anthropic", "api_key")
    if not api_key:
        return IntegrationTestResult(ok=False, message="Chave da Anthropic não configurada.")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/models",
        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if 200 <= resp.status < 300:
                return IntegrationTestResult(ok=True, message="Conexão com a Anthropic bem-sucedida.")
            return IntegrationTestResult(ok=False, message=f"Resposta inesperada da Anthropic (HTTP {resp.status}).")
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return IntegrationTestResult(ok=False, message="Chave da Anthropic inválida (401).")
        return IntegrationTestResult(ok=False, message=f"Falha ao chamar a Anthropic (HTTP {exc.code}).")
    except Exception as exc:  # noqa: BLE001 - surface any failure as a plain test result
        logger.warning("Anthropic integration test failed: %s", exc)
        return IntegrationTestResult(ok=False, message="Falha ao conectar à Anthropic (timeout ou rede).")


def _test_elevenlabs() -> IntegrationTestResult:
    api_key = get_integration_value("elevenlabs", "api_key")
    if not api_key:
        return IntegrationTestResult(ok=False, message="Chave da ElevenLabs não configurada.")
    # GET /v1/user: cheap, no credits spent, returns subscription info.
    req = urllib.request.Request("https://api.elevenlabs.io/v1/user", headers={"xi-api-key": api_key})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if 200 <= resp.status < 300:
                return IntegrationTestResult(ok=True, message="Conexão com a ElevenLabs bem-sucedida.")
            return IntegrationTestResult(ok=False, message=f"Resposta inesperada da ElevenLabs (HTTP {resp.status}).")
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            return IntegrationTestResult(ok=False, message=f"Chave da ElevenLabs inválida ({exc.code}).")
        return IntegrationTestResult(ok=False, message=f"Falha ao chamar a ElevenLabs (HTTP {exc.code}).")
    except Exception as exc:  # noqa: BLE001 - surface any failure as a plain test result
        logger.warning("ElevenLabs integration test failed: %s", exc)
        return IntegrationTestResult(ok=False, message="Falha ao conectar à ElevenLabs (timeout ou rede).")


def _test_vimeo() -> IntegrationTestResult:
    client_id = get_integration_value("vimeo", "client_id")
    client_secret = get_integration_value("vimeo", "client_secret")
    missing = [label for label, value in (("Client ID", client_id), ("Client Secret", client_secret)) if not value]
    if missing:
        return IntegrationTestResult(ok=False, message=f"Faltando: {', '.join(missing)}.")
    if not re.fullmatch(r"[0-9a-fA-F]{32,64}", client_id or ""):
        return IntegrationTestResult(
            ok=False, message="Client ID não parece um Client ID válido do Vimeo (esperado uma string hexadecimal)."
        )
    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    req = urllib.request.Request(
        "https://api.vimeo.com/oauth/authorize/client",
        data=urllib.parse.urlencode({"grant_type": "client_credentials", "scope": "public"}).encode(),
        headers={
            "Authorization": f"Basic {credentials}",
            "Accept": "application/vnd.vimeo.*+json;version=3.4",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if 200 <= resp.status < 300:
                return IntegrationTestResult(ok=True, message="Conexão com o Vimeo bem-sucedida.")
            return IntegrationTestResult(ok=False, message=f"Resposta inesperada do Vimeo (HTTP {resp.status}).")
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return IntegrationTestResult(ok=False, message="Credenciais do Vimeo inválidas (401).")
        return IntegrationTestResult(ok=False, message=f"Falha ao chamar o Vimeo (HTTP {exc.code}).")
    except Exception as exc:  # noqa: BLE001 - surface any failure as a plain test result
        logger.warning("Vimeo integration test failed: %s", exc)
        return IntegrationTestResult(ok=False, message="Falha ao conectar ao Vimeo (timeout ou rede).")


def _test_generic(integration_id: str, definition) -> IntegrationTestResult:
    missing = [f.label for f in definition.fields if f.required and not get_integration_value(integration_id, f.key)]
    if missing:
        return IntegrationTestResult(ok=False, message=f"Faltando: {', '.join(missing)}.")
    if integration_id == "youtube":
        client_id = get_integration_value("youtube", "client_id") or ""
        if not client_id.endswith(".apps.googleusercontent.com"):
            return IntegrationTestResult(
                ok=False, message="Client ID não parece um Client ID válido do Google (esperado terminar em .apps.googleusercontent.com)."
            )
    return IntegrationTestResult(
        ok=True, message="Formato válido. O teste completo acontece ao clicar em Conectar."
    )


@router.post("/{integration_id}/test", response_model=IntegrationTestResult)
def test_integration_settings(integration_id: str) -> IntegrationTestResult:
    definition = _get_def_or_404(integration_id)
    if integration_id == "anthropic":
        return _test_anthropic()
    if integration_id == "vimeo":
        return _test_vimeo()
    if integration_id == "elevenlabs":
        return _test_elevenlabs()
    return _test_generic(integration_id, definition)
