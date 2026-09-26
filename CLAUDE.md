# Projetos Cortes

App para gerar cortes verticais (Shorts/Reels/TikTok) de vídeos licenciados,
de domínio público ou CC, e publicá-los via APIs oficiais (YouTube Shorts,
TikTok, Bilibili, Meta Reels). Plano completo:
`~/.claude/plans/bem-vindo-ao-proejtos-atomic-sutherland.md`.

## Regra central: nada é publicado sem passar pelo rights gate

Todo `MediaAsset` é obrigatoriamente vinculado a uma `Source` (registro de
licença). Nenhum corte pode ir para a fila de publicação sem que
`services/api/app/rights/gate.py::check_publishable(source, platform, now, monetized)`
retorne `ok=True`. O gate bloqueia:

- licença ausente (`Source` inexistente ou sem `license_type`);
- fora da janela de validade (`valid_from`/`valid_until`);
- plataforma não presente em `allowed_platforms`;
- `cc_by_nc` quando `monetized=True`;
- `cc_by_nd` sempre — um corte é obra derivada, e ND proíbe isso incondicionalmente;
- `monetization_allowed=False` quando `monetized=True`.

Essa função é **pura** (sem DB/HTTP) e é a única fonte de verdade para essa
decisão — não duplique essa lógica em publishers ou em outros lugares.
Uploads sem `source_id` são rejeitados antes mesmo de começar, pelo hook
`pre-create` do tusd (`services/api/app/routers/uploads.py`).

## Auth

Login por sessão em cookie httpOnly (`cortes_session`, JWT HS256, 7 dias),
implementado em `services/api/app/security.py` (hash argon2 + JWT + cookie),
`app/rate_limit.py` (rate limit em memória), `app/deps.py` (dependência
`get_current_user`) e `app/routers/auth.py`.

- `POST /api/auth/login` `{username, password}` → 200 com o usuário
  (`UserRead`) e `Set-Cookie: cortes_session=...; HttpOnly; SameSite=Lax;
  Path=/` (mais `Secure` se `COOKIE_SECURE=true`); 401 genérico em
  credenciais inválidas; 429 após 5 tentativas falhas por IP+username em 15
  min (reseta no sucesso).
- `POST /api/auth/logout` → limpa o cookie, sempre 200.
- `GET /api/auth/me` → usuário autenticado ou 401.
- Todas as rotas `/api/*` exigem sessão válida (dependência de router,
  `dependencies=[Depends(get_current_user)]`), **exceto**: `/api/health`,
  `/api/auth/login`, `/api/auth/logout` e o hook do tusd.
- Hook do tusd (`POST /api/uploads/tusd-hook`, público na rede interna):
  no evento `pre-create`, exige o mesmo cookie de sessão (tusd repassa o
  header `Cookie` do cliente via `-hooks-http-forward-headers=Cookie` no
  `docker-compose.yml`); sem sessão válida, responde `RejectUpload: true` +
  `HTTPResponse.StatusCode: 401` (o endpoint do hook em si sempre responde
  HTTP 200, como exige o protocolo do tusd). **Risco residual conhecido**:
  não há segredo estático entre tusd e o hook (a versão do tusd em uso não
  tem flag para isso) e apenas `pre-create` valida sessão — `post-finish`/
  `post-terminate` continuam alcançáveis por quem tiver acesso à porta da
  API sem cookie, podendo criar `MediaAsset` "órfãos" apontando para
  `storage_key` arbitrário (não expõe conteúdo, só polui a tabela). Mitigar
  de verdade exigiria segmentar a rede (tusd/API sem porta pública, atrás de
  proxy) — fora do escopo deste especialista, sinalizar para
  pipeline-specialist/production-ops se virar prioridade.
- Admin inicial: `python -m app.cli create-admin` (dentro do container
  `api`) cria o usuário a partir de `ADMIN_USERNAME`/`ADMIN_PASSWORD` (não
  sobrescreve senha existente; use `--reset` para trocar). Não é criado
  automaticamente no startup do FastAPI, de propósito.
- `SECRET_KEY` é obrigatório e precisa ter 32+ caracteres — a API recusa
  subir sem isso (`app/config.py::Settings._require_secret_key`).
- Testes de auth usam SQLite em memória (`services/api/tests/conftest.py`);
  `Source`/`MediaAsset` usam tipos só-Postgres (`ARRAY`, `UUID`) que não
  compilam DDL em SQLite, então a tabela `sources` de teste é criada via SQL
  cru — ver o docstring do fixture antes de mexer nisso.

## Stack

- **API** (`services/api`): FastAPI + SQLAlchemy 2 + Alembic + pydantic-settings, Python 3.12.
- **Worker/beat**: Celery (broker/backend Redis) + FFmpeg. **Mesma base de código da API**
  (`services/api/app/worker/*`) — não existe mais um serviço `services/worker` separado; ver "Worker unificado" abaixo.
- **Web** (`apps/web`): Next.js (mantido por outro especialista — não editar aqui sem coordenar).
- **Infra** (`docker-compose.yml`): Postgres 16, Redis 7, SeaweedFS (S3-compatível), tusd (upload retomável).

## Estrutura

```
projetos_cortes/
├─ docker-compose.yml
├─ .env.example
├─ apps/web/                 # Next.js (frontend-specialist)
└─ services/api/
   ├─ Dockerfile              # multi-stage: target `api` (uvicorn) e `worker` (celery, +ffmpeg)
   ├─ requirements.txt        # compartilhado por api E worker (fastapi, celery, boto3, cryptography...)
   ├─ requirements-worker.txt # só do target `worker`, hoje vazio/comentado — espaço para libs pesadas (etapa B/C)
   ├─ app/
   │  ├─ main.py             # monta os routers
   │  ├─ config.py           # Settings (pydantic-settings)
   │  ├─ db.py                # engine, SessionLocal, Base, get_db
   │  ├─ security.py          # hash de senha (argon2), JWT, cookie de sessão
   │  ├─ crypto.py             # Fernet encrypt/decrypt_token (TOKEN_ENCRYPTION_KEY) p/ tokens OAuth
   │  ├─ storage.py            # cliente S3 (boto3) + stream_s3_object (Range/206) p/ vídeo/thumbnail
   │  ├─ scheduling.py         # find_next_slot: agendamento "auto" respeitando posting_windows/daily_limit
   │  ├─ presets.py            # PRESET_WEIGHTS (pesos default por preset)
   │  ├─ audit.py              # record_action() -> AuditLog
   │  ├─ deps.py              # get_current_user (protege rotas /api/*)
   │  ├─ rate_limit.py        # rate limit em memória do login
   │  ├─ cli.py                # `python -m app.cli create-admin`
   │  ├─ models/              # Source, MediaAsset, User, AnalysisJob, Clip, ClipMetadata,
   │  │                        # PlatformAccount, Publication, AuditLog, enums.py (Platform compartilhado)
   │  ├─ schemas/             # Pydantic (request/response) — um módulo por recurso
   │  ├─ routers/             # health, auth, sources, media_assets, uploads, jobs, clips,
   │  │                        # accounts, publications, audit_log, dashboard
   │  ├─ rights/gate.py       # rights gate (ver acima)
   │  ├─ rights/attribution.py # build_description(): sempre injeta attribution_text da Source
   │  └─ worker/               # MESMO pacote da API — não duplica models/schemas/rights
   │     ├─ celery_app.py      # Celery app (broker/backend = REDIS_URL); task_always_eager em testes
   │     ├─ tasks.py           # run_analysis, render_clip, regenerate_metadata, publish_clip,
   │     │                      # takedown_publication — todos STUBS nesta etapa (ver "Worker" abaixo)
   │     ├─ analysis/ render/ metadata/  # vazios, a preencher na etapa B/C
   │     └─ publishers/base.py # interface Publisher: upload, status, delete (movido de services/worker)
   ├─ alembic/versions/        # 0001 sources+media_assets, 0002 users, 0003 analysis/clips/publishing
   └─ tests/                   # pytest — ver "Testes" abaixo
```

## Worker unificado (api/worker/beat = mesma imagem)

`services/api/Dockerfile` é multi-stage: o estágio `base` instala
`requirements.txt` e copia todo `services/api` (models, schemas, rights
gate, `app/worker/*`); `api` roda uvicorn a partir dele; `worker` instala
adicionalmente `requirements-worker.txt`, instala `ffmpeg` via apt e roda
`celery -A app.worker.celery_app.celery_app worker`; `beat` usa a mesma
imagem `worker` só trocando o `command` para `celery ... beat`. Isso elimina
o antigo `services/worker` (removido) e a duplicação de models entre API e
worker — uma única fonte de verdade.

`docker-compose.yml`: `api` builda com `target: api`; `worker` e `beat`
buildam `context: ./services/api` com `target: worker` e montam
`./services/api:/app` (não mais `./services/worker`).

Tasks Celery (`app/worker/tasks.py`, todas **stubs** nesta etapa — a lógica
real é da etapa B/C):
- `run_analysis(job_id: str)` — enfileirada por `POST /api/media-assets/{id}/analyze`.
  Hoje só marca o `AnalysisJob` `queued → running → done` (progress=100);
  etapa B substitui o meio disso por `app/worker/analysis/*` + `render/*` e
  passa a criar `Clip`s de verdade.
- `render_clip(clip_id: str)` — enfileirada por `PATCH /api/clips/{id}` quando
  `start_s`/`end_s` mudam. Stub (`not_implemented`).
- `regenerate_metadata(clip_id: str, platform: str | None)` — enfileirada por
  `POST /api/clips/{id}/metadata/regenerate`. Stub.
- `publish_clip(publication_id: str)` / `takedown_publication(publication_id: str)`
  — reservadas para a etapa 5 (publishers). **Nunca** enfileirar `publish_clip`
  para um par (clip, account) que não passou por `check_publishable` antes —
  isso já é garantido em `POST /api/publications/batch`, que só marca
  `scheduled`/`exported` depois do gate passar.

`Settings.celery_task_always_eager` (env `CELERY_TASK_ALWAYS_EAGER`) roda
tasks in-process sem broker — usado só em `tests/conftest.py`, nunca em
produção.

## Comandos

Subir tudo:
```
cp .env.example .env   # editar credenciais reais
docker compose up --build
```

Subir só api/worker/beat depois de mudar código do backend:
```
docker compose up -d --build api worker beat
```

Validar o compose sem subir nada:
```
docker compose config
```

Rodar os testes da API (rights gate + auth):
```
cd services/api
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest
```

Alembic (dentro do container `api`, ou localmente com `DATABASE_URL` apontando
para o Postgres do compose):
```
cd services/api
alembic upgrade head
alembic revision -m "descrição" --autogenerate
```

## Pipeline de análise → clips → publicação (etapa A: contrato; motor real é etapa B/C)

Modelos novos em `services/api/app/models/` (migration `0003`):

- **AnalysisJob**: `media_asset_id`, `status` (`queued|running|done|failed|canceled`),
  `progress` (0-100), `stage`, `preset` (`action|drama|comedy|suspense|custom`),
  `params` JSON (`weights`, `min_duration`, `max_duration`, `max_clips`, `language`,
  `burn_subtitles`, `reframe_mode: auto|blur|center`), `error`, timestamps.
- **Clip**: `job_id`, `media_asset_id`, `start_s`/`end_s`, `score`, `signals` JSON,
  `storage_key`/`thumbnail_key`/`subtitles_key` (S3, bucket `media`), `transcript`,
  `status` (`rendering|pending_review|approved|rejected|failed`).
- **ClipMetadata**: `clip_id` + `platform` (único por par), `title`, `description`,
  `hashtags` (JSON list), `edited`.
- **PlatformAccount**: `platform`, `display_name`, `mode` (`oauth|manual`),
  tokens **cifrados** (`app/crypto.py`, Fernet + `TOKEN_ENCRYPTION_KEY` — nunca expostos
  em nenhum schema de resposta), `daily_limit`, `posting_windows` JSON
  (`[{"days":[0-6], "start":"HH:MM", "end":"HH:MM"}]`, dias 0=segunda), `timezone`
  (default `America/Sao_Paulo`), `template` JSON, `monetized`.
- **Publication**: `clip_id`, `account_id`, `platform`, `status`
  (`blocked|scheduled|publishing|published|failed|canceled|taken_down|exported`),
  `scheduled_at`, `privacy` (`private|public|self_only`), `block_reasons` JSON.
- **AuditLog**: `user_id` (nullable — ações automáticas do worker não têm usuário),
  `action`, `entity`, `entity_id`, `details` JSON. Populado por `app/audit.py::record_action`
  em toda ação relevante (criar/cancelar job, aprovar/rejeitar/editar clip, criar/cancelar/
  takedown de publicação, criar/editar/apagar conta).

`Platform` (`youtube|tiktok|bilibili|instagram|facebook`) é um enum **compartilhado**
(`app/models/enums.py::platform_enum`) entre `ClipMetadata`, `PlatformAccount` e
`Publication` — mesmo tipo Postgres `platform` nas três tabelas.

Endpoints principais (todos sob `/api/*`, protegidos por `get_current_user`):
`POST /media-assets/{id}/analyze` (cria `AnalysisJob` + enfileira `run_analysis`),
`GET /jobs`, `GET /jobs/{id}`, `POST /jobs/{id}/cancel`, `GET /presets`,
`GET /clips`, `GET /clips/{id}` (com `metadata: [...]` por plataforma),
`PATCH /clips/{id}` (aprova/rejeita OU ajusta `start_s`/`end_s` → reenfileira render),
`POST /clips/bulk`, `PUT /clips/{id}/metadata/{platform}`,
`POST /clips/{id}/metadata/regenerate`, `GET /clips/{id}/video|thumbnail` e
`GET /media-assets/{id}/video` (stream S3 com suporte a `Range`/206, via
`app/storage.py::stream_s3_object`), `GET /platforms`, `GET|POST|PATCH|DELETE /accounts`,
`GET /accounts/{platform}/connect|callback` (stub `501` — OAuth é etapa C),
`POST /publications/batch` (roda o rights gate por par clip×conta; `clip` precisa
`approved`; conta `manual` → `exported` direto; `oauth` → `scheduled` via
`app/scheduling.py::find_next_slot` no modo `"auto"`, ou `"now"`/ISO datetime),
`GET /publications`, `POST /publications/{id}/cancel|takedown`,
`GET /publications/{id}/export` (zip `video.mp4` + `metadata.txt`, descrição sempre
passa por `app/rights/attribution.py::build_description`), `GET /audit-log`,
`GET /dashboard/summary`.

**Contrato de API estável a partir daqui** — qualquer mudança de campo/rota deve ser
avisada explicitamente ao frontend-specialist (e às próximas etapas do backend).

## Testes

`services/api/tests/`: `conftest.py` cria as tabelas `sources`/`media_assets`
via SQL cru (tipos só-Postgres) e as tabelas novas (`AnalysisJob`, `Clip`,
`ClipMetadata`, `PlatformAccount`, `Publication`, `AuditLog`) via
`Base.metadata.create_all()` — **por isso esses modelos usam
`sqlalchemy.Uuid`/`JSON` genéricos em vez de `postgresql.UUID`/`ARRAY`**, de
propósito, para rodar em SQLite nos testes e em Postgres em produção sem
duas definições. `tests/factories.py` tem helpers (`insert_source`,
`insert_media_asset`, `insert_clip`, `insert_account`) e `tests/fake_s3.py`
um stub de cliente S3 (override de `app.storage.get_s3_client` via
`app.dependency_overrides`) para testar Range/206 sem SeaweedFS real.
`CELERY_TASK_ALWAYS_EAGER=true` nos testes evita depender de Redis.

Cobertura nova: `test_publications_batch.py` (gate bloqueia clip não aprovado/
CC-BY-ND/CC-BY-NC monetizado/plataforma fora de `allowed_platforms`; conta
manual → `exported`; conta oauth + `schedule=now` → `scheduled`),
`test_scheduling.py` (unit, `find_next_slot`: sem janela, janela futura,
próximo dia da semana permitido, `daily_limit` empurra para o dia seguinte),
`test_streaming.py` (200 corpo inteiro, 206 com `Content-Range` correto, 404
objeto ausente, 401 sem sessão), `test_new_endpoints_permissions.py` (401 em
todo endpoint novo sem cookie). A janela "fora de validade" do rights gate
**não** é re-testada via HTTP (SQLite não faz round-trip de datetime
timezone-aware do jeito que o Postgres real faz) — fica coberta só pelo
teste puro já existente em `test_rights_gate.py`, que é a fonte de verdade
daquela lógica de qualquer forma.

## Convenções

- Toda mudança de modelo passa por uma migration Alembic (não editar o schema à mão).
- Endpoints ficam em `app/routers/*`, um router por recurso, montados em `app/main.py`.
- Schemas Pydantic (`app/schemas/*`) nunca são os modelos SQLAlchemy diretamente — sempre há uma camada de tradução.
- Novo publisher de plataforma (`app/worker/publishers/*.py`) deve herdar de `Publisher` (base.py) e nunca reimplementar checagem de direitos — isso é responsabilidade exclusiva do rights gate, chamado antes do `upload()`.
- `ClipDetailRead.metadata` lê do atributo ORM `Clip.metadata_entries` via
  `validation_alias` — o nome `metadata` está reservado em qualquer
  `DeclarativeBase` do SQLAlchemy (é o `MetaData` da classe), então nenhum
  model pode ter uma coluna/relationship literalmente chamada `metadata`.
- **Nota de processo**: modelos SQLAlchemy e a migration `0003` foram
  implementados pelo backend-specialist nesta etapa (contrato de schema já
  vinha totalmente especificado pelo pedido), fora do fluxo normal em que
  isso é do database-specialist. Recomendado: uma revisão do
  database-specialist sobre `alembic/versions/0003_analysis_publishing.py`
  e os novos `app/models/*.py` (índices, tipos JSON vs JSONB, particionamento
  de `audit_log` a médio prazo) antes de mudanças de schema futuras.
