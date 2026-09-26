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
│  │  ├─ models/              # Source, MediaAsset (SQLAlchemy)
│  │  ├─ schemas/             # Pydantic (request/response)
│  │  ├─ routers/             # health, sources (CRUD), media_assets, uploads (tusd hook)
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

Rodar os testes da API (rights gate):
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
