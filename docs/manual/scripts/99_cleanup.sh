#!/bin/sh
# Limpeza TOTAL da demo: apaga dados de dominio, objetos S3 e (se WITH_USERS=1) os usuarios demo.
# Mantem apenas usuarios reais (nao termina em .demo). Rodar da raiz do repo.
set -e
cd "$(dirname "$0")/../../.."
docker compose exec -T api python - <<'PY'
from app.storage import get_s3_client
from app.config import get_settings
s = get_settings(); c = get_s3_client(); n = 0
for pg in c.get_paginator("list_objects_v2").paginate(Bucket=s.s3_bucket):
    allk = [o["Key"] for o in pg.get("Contents", [])]
    print("fora de users/ (mantido):", [k for k in allk if not k.startswith("users/")])
    ks = [{"Key": k} for k in allk if k.startswith("users/")]
    if ks: c.delete_objects(Bucket=s.s3_bucket, Delete={"Objects": ks}); n += len(ks)
print("s3 objetos apagados:", n)
PY
docker compose exec -T postgres psql -U cortes -d cortes -v ON_ERROR_STOP=1 <<'SQL'
TRUNCATE ai_usage_events, story_media_jobs, story_character_events, story_characters, story_episodes, story_series, publications, clip_metadata, clips, analysis_jobs, media_assets, sources, platform_accounts, channels, audit_log CASCADE;
SQL
if [ "$WITH_USERS" = "1" ]; then
docker compose exec -T postgres psql -U cortes -d cortes -v ON_ERROR_STOP=1 -c "DELETE FROM users WHERE username LIKE '%.demo'" -c "SELECT username,is_admin FROM users"
fi
