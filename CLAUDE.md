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
   │  │                        # PlatformAccount, Publication, AuditLog, Channel, enums.py (Platform compartilhado)
   │  ├─ channels.py           # effective_template()/effective_analysis_defaults() (ver "Canais" abaixo)
   │  ├─ schemas/             # Pydantic (request/response) — um módulo por recurso
   │  ├─ routers/             # health, auth, sources, channels, media_assets, uploads, jobs, clips,
   │  │                        # accounts, publications, audit_log, dashboard
   │  ├─ rights/gate.py       # rights gate (ver acima)
   │  ├─ rights/attribution.py # build_description(): sempre injeta attribution_text da Source
   │  └─ worker/               # MESMO pacote da API — não duplica models/schemas/rights
   │     ├─ celery_app.py      # Celery app (broker/backend = REDIS_URL); task_always_eager em testes
   │     ├─ tasks.py           # run_analysis, render_clip, regenerate_metadata, publish_clip,
   │     │                      # takedown_publication — todos STUBS nesta etapa (ver "Worker" abaixo)
   │     ├─ analysis/ render/ metadata/  # vazios, a preencher na etapa B/C
   │     └─ publishers/base.py # interface Publisher: upload, status, delete (movido de services/worker)
   ├─ alembic/versions/        # 0001 sources+media_assets, 0002 users, 0003 analysis/clips/publishing,
   │                            # 0004 channels
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

## Canais (multi-canal, migration `0004`)

Suporte a múltiplos canais do usuário (ex.: vários canais de YouTube, cada um
com um nicho/tipo de conteúdo diferente), cada canal podendo ter contas em
outras plataformas.

- **Channel** (`app/models/channel.py`): `id`, `name`, `slug` (único), `niche`
  (texto livre), `color` (hex, para UI), `default_preset` (enum `Preset`,
  opcional), `default_params` JSON (mesmo formato de `AnalysisJob.params`),
  `template` JSON (mesmo formato de `PlatformAccount.template`: `language`,
  `tone`, `fixed_hashtags`, `title_max`, `extra_description`), `is_active`,
  `created_at`. Usa os tipos portáveis `sqlalchemy.Uuid`/`JSON` (roda em
  SQLite nos testes, como `AnalysisJob`/`Clip`/etc — ver "Testes").
- `PlatformAccount.channel_id` (FK nullable → `channels.id`, `ON DELETE SET
  NULL`). Unique constraint `(channel_id, platform)` — um canal só pode ter
  UMA conta por plataforma; contas com `channel_id IS NULL` não entram nessa
  restrição (NULL é distinto de NULL em unique constraints, tanto em
  Postgres quanto SQLite).
- `MediaAsset.channel_id` (FK nullable) e `Source.default_channel_id` (FK
  nullable, `ON DELETE SET NULL`).
- `AnalysisJob.channel_id`/`Clip.channel_id` (FK nullable) — copiado do
  `MediaAsset` (ou do `channel_id` explícito do request) no momento do
  `POST /analyze`; ainda não populado por um pipeline real de criação de
  `Clip` (etapa B, stub).
- **Template efetivo**: `app/channels.py::effective_template(channel,
  account)` faz merge raso `channel.template` + `account.template`, com a
  conta sobrescrevendo em colisão de chave — usar isso (não duplicar a
  lógica) sempre que a etapa de metadados (`app/worker/metadata`, ainda
  stub) precisar do template de um par canal+conta.
  `app/channels.py::effective_analysis_defaults(channel)` retorna
  `(preset_value, params_dict)` para os defaults de análise do canal.

Endpoints novos (todos sob `/api/*`, protegidos por `get_current_user`):

- `GET /channels` / `GET /channels/{id}` → `ChannelWithCounts` (campos do
  canal + `counts`: `accounts_by_platform` (dict por `Platform`),
  `clips_pending_review`, `publications_scheduled`, `publications_published`
  — contagens escopadas por `Clip.channel_id`/`PlatformAccount.channel_id`).
- `POST /channels` (409 se `slug` duplicado), `PATCH /channels/{id}` (409 se
  troca de `slug` colide com outro canal), `DELETE /channels/{id}` (**409**
  se existir `Publication` com `status="scheduled"` cujo `Clip.channel_id`
  seja o canal — cancele as publicações antes de excluir).
- `PATCH /media-assets/{id}` `{channel_id}` (novo endpoint — antes só havia
  GET/list/video/analyze neste router).
- `POST /accounts` e `PATCH /accounts/{id}` aceitam `channel_id` — 404 se o
  canal não existir, **409** se o canal já tiver uma conta para aquela
  plataforma. `PATCH` que muda `channel_id` grava `account.link_channel` no
  audit log (em vez de `account.update`).
- `POST /media-assets/{id}/analyze`: `preset` e `params` agora são
  **opcionais** no corpo — se omitidos, usam `channel.default_preset`/
  `.default_params` do canal resolvido (`payload.channel_id` explícito, ou
  senão `media_asset.channel_id`); se não houver canal nem `preset`
  explícito, **422**. Novo campo opcional `channel_id` no request, que
  sobrescreve o do `MediaAsset` só para aquele job (e é o valor persistido
  em `AnalysisJob.channel_id`/`Clip.channel_id`).
- `POST /publications/batch`: novo campo `target` (`"accounts"` default |
  `"channel"`). Com `target="channel"`, `account_ids` **não** deve ser
  enviado (422 se enviado) — cada clip é publicado em **todas** as
  `PlatformAccount` vinculadas ao `Clip.channel_id` daquele clip (422 se
  algum clip não tiver `channel_id`). O rights gate roda por par (clip,
  conta) igual ao modo existente.
- Filtro `channel_id` (query param) em `GET /clips`, `GET /jobs`,
  `GET /publications` (via join com `Clip`, já que `Publication` não tem
  `channel_id` próprio), `GET /media-assets`, `GET /accounts` e
  `GET /dashboard/summary`.
- Hook do tusd (`POST /api/uploads/tusd-hook`): `metadata.channel_id` agora
  é aceito e opcional — `pre-create` valida que existe (404 se não);
  `post-finish` usa `metadata.channel_id` se vier, senão
  `source.default_channel_id`, para preencher `MediaAsset.channel_id`.
- `AuditLog` novo: `channel.create`/`channel.update`/`channel.delete` e
  `account.link_channel` (ver acima).

**Contrato de API estável a partir daqui** — qualquer mudança de campo/rota
deve ser avisada explicitamente ao frontend-specialist.

## Multiusuário (multi-tenant por usuário, migration `0005`)

Decisões do dono do produto: admin vê **tudo**, com filtro opcional "ver
como usuário X"; usuário comum vê **somente** os próprios dados. Fontes e
canais são por usuário. Cotas (armazenamento, análises/dia, nº de canais)
são por usuário, com admin sempre isento.

- **Ownership**: `Source`, `MediaAsset`, `Channel`, `AnalysisJob`, `Clip`,
  `PlatformAccount`, `Publication` ganharam `owner_id` (FK `users.id`, index,
  NOT NULL, backfillado no upgrade com o admin mais antigo). `ClipMetadata`
  **não** tem `owner_id` próprio — sempre acessado via `clip.owner_id`.
  `AuditLog.user_id` (já existia) é o **ator** da ação, não o dono do
  recurso — dois conceitos diferentes, ver escopo do audit-log abaixo.
  `channels.slug` deixou de ser único globalmente e passou a ser único por
  `(owner_id, slug)` (`uq_channels_owner_slug`) — dois usuários podem ter um
  canal "principal" cada um.
- **`users` ganhou**: `display_name`, `email` (opcional, único quando não
  nulo), `must_change_password` (bool, default `false`), e três cotas
  nuláveis = ilimitado: `storage_quota_bytes`, `daily_analysis_quota`,
  `max_channels`. `media_assets.size_bytes`/`clips.size_bytes` (bigint,
  nuláveis) alimentam o cálculo de armazenamento usado — preenchidos pelo
  hook do tusd (`Upload.Size`) e por `render_clip` (tamanho do arquivo
  renderizado), respectivamente.
- **Escopo central — `app/scope.py`**: `get_scope` é a dependência que TODO
  router que toca dado "dono-ável" deve usar em vez de (ou além de)
  `get_current_user`. Resolve um `Scope` com:
  - `owner_id`: valor para *filtrar* leituras — `None` só é possível para um
    admin sem `as_user` (vê tudo, sem filtro).
  - `create_owner_id`: valor para *carimbar* em toda criação — nunca `None`;
    é o próprio admin quando ele não está impersonando ninguém.
  - `Scope.owned(query, Model)`: aplica o filtro (no-op se `owner_id is
    None`). `get_owned_or_404(db, Model, id, scope)`: busca por id já
    escopado, **404 (nunca 403)** tanto para "não existe" quanto para
    "existe mas é de outro dono" — um 403 vazaria a existência do recurso.
  - `Scope.audit_details(details)`: injeta `details["as_user"]` quando um
    admin agiu em nome de outro usuário (usado em toda chamada a
    `record_action` nos routers).
  - `require_admin`: dependência 403-se-não-admin, usada só por
    `app/routers/admin_users.py`.
- **`as_user`**: query param `?as_user=<uuid>` OU header `X-As-User:
  <uuid>`. Só tem efeito para admin (404 se o `uuid` não existir); um
  usuário comum passando qualquer um dos dois é **silenciosamente ignorado**
  (nunca erro, nunca vaza dado de outro usuário). Criar um recurso com
  `as_user` ativo cria em nome do usuário alvo (`owner_id` = alvo), e o
  `AuditLog` registra o admin como ator (`user_id`) com
  `details.as_user = <alvo>`.
- **Validações cruzadas de dono** (sempre 404, nunca 403): `MediaAsset` só
  aceita `channel_id` de um canal do mesmo dono (`PATCH
  /media-assets/{id}`, `POST .../analyze`); `Source.default_channel_id`
  idem; `PlatformAccount` só aceita `channel_id` de um canal do mesmo dono
  (`POST`/`PATCH /accounts`); `POST /publications/batch` resolve **um único
  dono** (`Scope.create_owner_id`) e só enxerga clips/contas desse dono —
  publicar o clip de um usuário na conta de outro é impossível mesmo para
  admin sem `as_user` (nesse caso o dono efetivo é o próprio admin).
- **Hook do tusd** (`app/routers/uploads.py`): `pre-create` identifica o
  usuário pela sessão, valida que `source_id` (e `channel_id`, se enviado)
  pertencem a ele — ou a qualquer dono, se quem faz upload é admin, caso em
  que o `MediaAsset` final pertence ao dono da Source, nunca ao admin — e
  checa a cota de armazenamento (`Upload.Size` do evento) antes de aceitar.
  A resposta do hook usa `ChangeFileInfo.MetaData` para acrescentar
  `owner_id` ao metadata do upload; tusd ecoa esse metadata de volta no
  `post-finish`, que **só** cria o `MediaAsset` se `metadata.owner_id` bate
  com o dono real da `Source` (mismatch ou ausência → ignora silenciosamente,
  não cria "órfão"). Isso fecha a parte do risco residual do tusd descrita
  em "Auth" que dizia respeito a spoofing de dono; a parte de rede
  (`post-finish`/`post-terminate` alcançáveis sem cookie) continua igual,
  pois é inerente à versão do tusd em uso.
  **Prefixo de storage por usuário**: aplicado nos objetos que o worker cria
  (`clips/.../video.mp4` → `users/{owner_id}/clips/.../video.mp4`), mas
  **não** nos uploads originais via tusd — a chave S3 de um upload tusd é o
  `Upload.ID` gerado pelo próprio tusd, e a versão em uso não expõe uma
  forma confiável de prefixá-la a partir do hook sem arriscar quebrar o
  fluxo de upload existente. O isolamento real desses objetos continua
  sendo o `owner_id` no banco (a rota de stream sempre resolve o
  `MediaAsset`/`Clip` via `get_owned_or_404` antes de tocar o S3) — ver nota
  em "Auth" sobre esse risco residual.
- **Worker**: `run_analysis` copia `owner_id` do `AnalysisJob` para cada
  `Clip` criado; `render_clip` preenche `Clip.size_bytes` com o tamanho do
  arquivo renderizado. `ClipMetadata`/`Publication` (criadas por
  `regenerate_metadata`/`POST /publications/batch`) não precisam copiar
  `owner_id` de novo — a primeira é acessada via `clip.owner_id`, a segunda
  já carimba `owner_id = Scope.create_owner_id` no próprio router.
- **Cotas** (`app/quotas.py`, admin sempre isento): armazenamento = soma de
  `media_assets.size_bytes` + `clips.size_bytes` do dono; excedida no
  `pre-create` do tusd → **413**. Análises/dia (fuso `America/Sao_Paulo`,
  conta `AnalysisJob.created_at` do dia local) excedida em `POST
  /media-assets/{id}/analyze` → **429**. Canais (`Channel` do dono) excedido
  em `POST /channels` → **409**. Defaults para usuário novo (usados quando o
  admin não informa um valor explícito em `POST /api/admin/users`):
  `DEFAULT_STORAGE_QUOTA_GB` (50), `DEFAULT_DAILY_ANALYSIS_QUOTA` (10),
  `DEFAULT_MAX_CHANNELS` (4) — env vars, ver `app/config.py`. Um valor
  explícito `null` no `POST`/`PATCH` de admin significa "ilimitado" e é
  respeitado (não é substituído pelo default).
- **Admin — gestão de usuários** (`app/routers/admin_users.py`, todas sob
  `/api/admin/users`, `require_admin` → 403 para não-admin):
  - `GET ""`: lista todos com `usage` (`storage_used_bytes`,
    `storage_quota_bytes`, `analyses_today`, `daily_analysis_quota`,
    `channels_count`, `max_channels`) e `clips_count`/`publications_count`.
  - `POST ""` `{username, password (10+ chars), display_name?, email?,
    is_admin?, storage_quota_gb?, daily_analysis_quota?, max_channels?,
    must_change_password? (default true)}` → 201; 409 username/email
    duplicado; 422 senha curta.
  - `PATCH "/{id}"` (dados, cotas — `storage_quota_gb` vira
    `storage_quota_bytes` internamente —, `is_active`, `is_admin`): 409 se o
    admin tentar remover o próprio `is_admin`/desativar a si mesmo
    (bloqueio incondicional), ou se a mudança deixasse o sistema sem nenhum
    admin ativo (`_count_active_admins`, defesa em profundidade — na prática
    só o caso "a si mesmo" é alcançável via API, já que quem chama o
    endpoint precisa estar ativo e ser admin).
  - `POST "/{id}/reset-password"` `{new_password}` → marca
    `must_change_password=true`.
  - `DELETE "/{id}"`: 409 se for a própria conta do admin; senão, **soft**
    (`is_active=false`) se o usuário tiver qualquer dado próprio (linhas nas
    7 tabelas donas + `audit_log.user_id`), **hard delete** só se
    completamente vazio.
- **Usuário**: `GET /api/me/usage` (uso/cotas próprios, sempre do usuário
  logado, sem `as_user`). `POST /api/auth/change-password`
  `{current_password, new_password (10+ chars)}` → limpa
  `must_change_password`; 401 se `current_password` errado. `GET
  /api/auth/me`/`UserRead` agora inclui `must_change_password`,
  `display_name`, `email`, e as três cotas.
- `get_current_user` já checava `is_active` no banco a cada request (não
  precisou mudar) — uma conta desativada perde a sessão imediatamente, sem
  esperar o JWT expirar.
- **`AuditLog` novo**: `user.create`/`user.update`/`user.deactivate`/
  `user.delete`/`user.reset_password`, `password.change`. Toda ação de
  admin em nome de outro usuário (via `as_user`) carrega
  `details.as_user = <uuid do alvo>` (ver `Scope.audit_details`).
- **Convenção**: todo novo router que leia/escreva um recurso "dono-ável"
  usa `app/scope.py::get_scope` (nunca reimplementar o filtro de dono à
  mão) — ver "Convenções" abaixo.

**Contrato de API estável a partir daqui** — qualquer mudança de campo/rota
deve ser avisada explicitamente ao frontend-specialist. Mudança de contrato
nesta etapa: `owner_id` foi adicionado à resposta de `Source`, `MediaAsset`
(+ `size_bytes`), `Channel`, `AnalysisJob`, `Clip`, `PlatformAccount` e
`Publication`; `UserRead`/`GET /api/auth/me` ganhou `display_name`, `email`,
`must_change_password` e as três cotas.

## Testes

`services/api/tests/`: `conftest.py` cria as tabelas `sources`/`media_assets`
via SQL cru (tipos só-Postgres, agora incluindo `default_channel_id`/
`channel_id`) e as tabelas novas (`Channel`, `AnalysisJob`, `Clip`,
`ClipMetadata`, `PlatformAccount`, `Publication`, `AuditLog`) via
`Base.metadata.create_all()` — **por isso esses modelos usam
`sqlalchemy.Uuid`/`JSON` genéricos em vez de `postgresql.UUID`/`ARRAY`**, de
propósito, para rodar em SQLite nos testes e em Postgres em produção sem
duas definições. `tests/factories.py` tem helpers (`insert_source`,
`insert_media_asset`, `insert_clip`, `insert_account`, `insert_channel`),
todos com um parâmetro `owner_id` opcional — se omitido, cai num "dono
padrão" resolvido via `contextvars` e setado automaticamente pela fixture
`user` (`tests/conftest.py`), o que manteve os ~100 testes de
single-tenant já existentes passando sem tocar em nenhum call site deles;
testes de isolamento passam `owner_id=other_user.id` explicitamente. Além
de `user`/`logged_in_client`, `conftest.py` tem `other_user`/
`other_logged_in_client` (segundo tenant) e `admin_user`/`admin_client`
(admin) — como sessão é cookie e um `TestClient` só tem um cookie jar,
simular duas sessões simultâneas usa um segundo `TestClient`, mas
**reaproveitando o portal anyio do primeiro** (`tc.portal = client.portal`,
ver `tests/conftest.py::_second_client`) em vez de abrir um novo — abrir
vários portais independentes por teste (um `with TestClient(app) as tc`
por cliente extra) causava flakiness intermitente na suíte completa
(request de um cliente ocasionalmente observando estado de outro),
resolvida ao compartilhar o portal. `tests/fake_s3.py` um stub de cliente S3 (override de
`app.storage.get_s3_client` via `app.dependency_overrides`) para testar
Range/206 sem SeaweedFS real. `CELERY_TASK_ALWAYS_EAGER=true` nos testes
evita depender de Redis — e a fixture `client` faz
`monkeypatch.setattr(app.db, "SessionLocal", session_factory)` para que uma
task eager (ex. `run_analysis`, disparada de verdade por
`POST /media-assets/{id}/analyze` nos testes de canais) enxergue as mesmas
tabelas da sessão de teste em vez de abrir seu próprio `sqlite://` vazio
(sem esse monkeypatch a chamada eager falha com "no such table").

Cobertura nova: `test_publications_batch.py` (gate bloqueia clip não aprovado/
CC-BY-ND/CC-BY-NC monetizado/plataforma fora de `allowed_platforms`; conta
manual → `exported`; conta oauth + `schedule=now` → `scheduled`),
`test_scheduling.py` (unit, `find_next_slot`: sem janela, janela futura,
próximo dia da semana permitido, `daily_limit` empurra para o dia seguinte),
`test_streaming.py` (200 corpo inteiro, 206 com `Content-Range` correto, 404
objeto ausente, 401 sem sessão), `test_new_endpoints_permissions.py` (401 em
todo endpoint novo sem cookie), `test_channels.py` (CRUD de canal + 409 de
slug duplicado/publicação agendada; unique conta por plataforma por canal
(inclusive múltiplas contas `channel_id=NULL` na mesma plataforma
permitidas); herança de `default_preset`/`default_params` no `analyze`
(com override explícito de `preset` e de `channel_id`, e 422 quando não há
preset nem canal); `POST /publications/batch` com `target="channel"`
(inclusive 422 sem `channel_id` no clip e 422 se `account_ids` for enviado
junto); filtros `channel_id` em `/media-assets`, `/clips`, `/accounts` e
`/dashboard/summary`). A janela "fora de validade" do rights gate **não** é
re-testada via HTTP (SQLite não faz round-trip de datetime timezone-aware do
jeito que o Postgres real faz) — fica coberta só pelo teste puro já
existente em `test_rights_gate.py`, que é a fonte de verdade daquela lógica
de qualquer forma.

Cobertura de multiusuário: `test_scope_isolation.py` (usuário B não
lista/lê/edita/exclui/faz stream de recurso de A em nenhum router —
sempre 404 —; validações cruzadas de dono em `PATCH /media-assets`,
`analyze`, `POST/PATCH /accounts`; admin vê tudo e filtra com `as_user`
(query e header `X-As-User`); `as_user` de usuário comum é ignorado; audit
log escopado por ator), `test_quotas.py` (413 armazenamento via hook do
tusd, 429 análises/dia, 409 canais — e isenção do admin em cada caso),
`test_admin_users.py` (CRUD de usuário, defaults de cota vindos do env,
senha curta 422, username/email duplicado 409, guarda de
last-admin/self-protection, reset-password + `must_change_password`,
soft- vs hard-delete, `change-password`, sessão de usuário desativado
morre imediatamente, `/api/me/usage`).

## Convenções

- Toda mudança de modelo passa por uma migration Alembic (não editar o schema à mão).
- Endpoints ficam em `app/routers/*`, um router por recurso, montados em `app/main.py`.
- Schemas Pydantic (`app/schemas/*`) nunca são os modelos SQLAlchemy diretamente — sempre há uma camada de tradução.
- Novo publisher de plataforma (`app/worker/publishers/*.py`) deve herdar de `Publisher` (base.py) e nunca reimplementar checagem de direitos — isso é responsabilidade exclusiva do rights gate, chamado antes do `upload()`.
- **Todo novo router que lê/escreve um recurso "dono-ável" (tiver ou herdar
  `owner_id`) usa `app/scope.py::get_scope`/`Scope.owned`/`get_owned_or_404`
  — nunca reimplementar o filtro de dono à mão nem checar `owner_id`
  manualmente num `if`.** Isso garante de graça: usuário comum só vê o
  próprio dado, admin vê tudo e pode restringir com `as_user`, e todo
  cross-owner vira 404 (nunca 403). Ao adicionar um recurso novo, decida se
  ele precisa de `owner_id` próprio (a maioria precisa) ou se é acessível só
  através de outro recurso já escopado (como `ClipMetadata` via `Clip`).
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
