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
- **Worker** (`services/worker`): Celery (broker/backend Redis) + FFmpeg, Python 3.12.
- **Web** (`apps/web`): Next.js (mantido por outro especialista — não editar aqui sem coordenar).
- **Infra** (`docker-compose.yml`): Postgres 16, Redis 7, SeaweedFS (S3-compatível), tusd (upload retomável).

## Estrutura

```
projetos_cortes/
├─ docker-compose.yml
├─ .env.example
├─ apps/web/                 # Next.js (frontend-specialist)
├─ services/api/
│  ├─ app/
│  │  ├─ main.py             # monta os routers
│  │  ├─ config.py           # Settings (pydantic-settings)
│  │  ├─ db.py                # engine, SessionLocal, Base, get_db
│  │  ├─ security.py          # hash de senha (argon2), JWT, cookie de sessão
│  │  ├─ deps.py              # get_current_user (protege rotas /api/*)
│  │  ├─ rate_limit.py        # rate limit em memória do login
│  │  ├─ cli.py                # `python -m app.cli create-admin`
│  │  ├─ models/              # Source, MediaAsset, User (SQLAlchemy)
│  │  ├─ schemas/             # Pydantic (request/response)
│  │  ├─ routers/             # health, auth, sources (CRUD), media_assets, uploads (tusd hook)
│  │  └─ rights/gate.py       # rights gate (ver acima)
│  ├─ alembic/                # migrations
│  └─ tests/                  # pytest (gate coberto com casos permitido/bloqueado)
└─ services/worker/
   └─ app/
      ├─ celery_app.py
      ├─ tasks.py             # analyze_media (placeholder, Fase 2)
      ├─ analysis/ render/ metadata/   # vazios, a preencher nas próximas fases
      └─ publishers/base.py   # interface Publisher: upload, status, delete
```

## Comandos

Subir tudo:
```
cp .env.example .env   # editar credenciais reais
docker compose up --build
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

## Convenções

- Toda mudança de modelo passa por uma migration Alembic (não editar o schema à mão).
- Endpoints ficam em `app/routers/*`, um router por recurso, montados em `app/main.py`.
- Schemas Pydantic (`app/schemas/*`) nunca são os modelos SQLAlchemy diretamente — sempre há uma camada de tradução.
- Novo publisher de plataforma (`services/worker/app/publishers/*.py`) deve herdar de `Publisher` (base.py) e nunca reimplementar checagem de direitos — isso é responsabilidade exclusiva do rights gate, chamado antes do `upload()`.
