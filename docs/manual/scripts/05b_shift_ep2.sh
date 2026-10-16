#!/bin/sh
# Antecipa em 1 dia as datas dos episodios (so dados de demo) para o ep.2 entrar na janela de antecedencia e chegar a "Aprovar roteiro".
cd "$(dirname "$0")/../../.."
docker compose exec -T postgres psql -U cortes -d cortes -c "update story_episodes set target_date = target_date - 1"
for i in 1 2 3; do docker compose exec -T api python -c "from app.worker.story.tasks import series_tick; print(series_tick())"; sleep 15; done
docker compose exec -T postgres psql -U cortes -d cortes -tc "select number,status,target_date from story_episodes order by number limit 4"
