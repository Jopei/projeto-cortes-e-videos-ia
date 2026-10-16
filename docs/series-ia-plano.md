# Séries de história com IA — plano de implementação

Fonte da verdade para os especialistas. Produzido pelo architect e ajustado com as decisões do dono do produto.

## Decisões do dono

- Temporada de **20 episódios de ~30 s**, vertical 9:16, PT-BR. Um episódio por dia.
- Visual em **vídeo gerado por IA**. O provedor real ainda **não foi escolhido**. Construir tudo com provedores `fake` e deixar a interface plugável.
- **Custo baixo é prioridade.** Cada cena tem `visual_mode: "video" | "image"`. O modo `image` usa uma imagem gerada por IA, animada por Ken Burns (zoom/pan com FFmpeg). A série tem `visual_strategy`:
  - `economy`: só imagens.
  - `hybrid`: no máximo `max_video_scenes_per_episode` cenas em vídeo, as demais em imagem. **Padrão.** Default `max_video_scenes_per_episode = 1`.
  - `full_video`: todas as cenas em vídeo.

  Isso exige uma interface `ImageGenProvider` (com `fake`) além de `VideoGenProvider`.
- Narração PT-BR com voz IA. TTS **ElevenLabs** é o primeiro provedor real, junto com o `fake`.
- **Roteiro aprovado pelo dono antes de gerar mídia.** `require_script_approval` default `true`. O vídeo final também é aprovado na Revisão. Sem aprovação, o episódio não posta.
- Orçamento por série e mensal por usuário: configuráveis, **sem valor fixo ainda**. Defaults vêm de env (`DEFAULT_SERIES_BUDGET_USD`, `DEFAULT_MONTHLY_AI_BUDGET_USD`; vazio = ilimitado). A UI mostra o custo estimado antes de iniciar e o custo acumulado.
- A IA tem liberdade para criar, matar e alterar o status de personagens, sempre via eventos registrados.

## Decisões de arquitetura

- **Reaproveitar `Clip` para o vídeo final do episódio.** Isso dá de graça Revisão, stream, `ClipMetadata`, `Publication`, cota e audit.
  - `clips.job_id` e `clips.media_asset_id` passam a ser nullable.
  - `clips.episode_id` (único).
  - `CHECK ck_clips_origin`: (`job_id` e `media_asset_id` NOT NULL) OU `episode_id` NOT NULL.
- **Rights gate intocado.** Cada série cria um `Source` com o novo `license_type = "ai_generated"`.
  - `attribution_text = "Conteúdo gerado com inteligência artificial."`
  - `allowed_platforms = []`, preenchido pelas plataformas das contas do canal no `start`.
  - `monetization_allowed` vem do corpo da criação.
- `app/clip_source.py::resolve_clip_source(db, clip)` resolve por `media_asset → source` ou `episode → series → source`. Substitui `_resolve_source` em `routers/publications.py` e a busca equivalente em `regenerate_metadata`.
- O núcleo de `create_publications_batch` é extraído para `app/publishing.py::create_publications(...)`. Ele é usado pelo batch e pela aprovação de episódio, e o gate fica num lugar só.
- **Eventos de estado de personagem.** São `proposed` no roteiro e passam a `applied` só na aprovação do vídeo final.
  - Aprovação sequencial: N só é aprovado com N-1 aprovado.
  - N é validado contra o estado projetado (aplicado + `proposed` de N-1).
  - Regenerar ou editar N-1 marca os posteriores não aprovados como `stale`.
- **Falha ou falta de aprovação empurra a agenda +1 dia.** Nenhum episódio é pulado.
- Enums novos usam `Enum(..., native_enum=False, length=32)` (VARCHAR). A exceção é `license_type` (nativo, `ADD VALUE`).
- **O prompt visual é montado em código, não pelo LLM:** `style_guide.visual_style` + `visual_description` fixa dos personagens em cena + prompt da cena.
  - Prompts visuais em inglês, narração em PT-BR.
  - Sem texto na tela e sem fala sincronizada.
- Tempos das legendas vêm do TTS (ElevenLabs devolve timestamps). Sem isso, alinhar com faster-whisper (`app/worker/analysis/speech.py`). Legendas com `render/subtitles.build_ass`.

## 1. Modelo de dados

Migration **0009**: `ALTER TYPE license_type ADD VALUE 'ai_generated'` em `autocommit_block`. Downgrade no padrão da `0008_platform_vimeo.py`. Adicionar ao `LicenseType`.

Migration **0010** usa tipos portáveis (`Uuid`, `JSON`, `Numeric`), como em `models/channel.py`.

`story_series`
- id, owner_id (FK users, index, NOT NULL), channel_id (FK channels, SET NULL, index), source_id (FK sources, NOT NULL)
- title(120), premise Text NOT NULL imutável, genre(60), tone(60), language(10) = `pt-BR`
- episode_count = 20 (CHECK), episode_duration_s = 30 (CHECK)
- timezone(64) = `America/Sao_Paulo`, publish_time "HH:MM", start_date Date null, lead_days 1..2 = 2, privacy(16) = `public`
- visual_strategy(16) = `hybrid`, max_video_scenes_per_episode Int = 1
- video_provider(32) null, video_options JSON, image_provider(32), image_options JSON, tts_provider(32), tts_voice_id(128), tts_options JSON
- planner_model(64) null, writer_model(64) null (null = valor de Settings)
- bible JSON (world, style_guide, relationships, season_arc, open_threads, premise_core_elements), bible_version Int = 0
- status (series_status), pause_reason(40) null, error Text null
- require_script_approval Bool = **true**, max_regenerations_per_episode Int = 3, budget_limit_usd Numeric(12,4) null, cost_usd_total Numeric(12,4) = 0
- originality_attested_at NOT NULL, created_at, updated_at

`story_characters` não tem owner_id; é acessado sempre via série.
- id, series_id (FK CASCADE, index), key(64) UNIQUE(series_id, key), name, role(20) protagonist|antagonist|supporting|minor
- description, visual_description, personality null
- status (character_status: alive|dead|injured|missing|transformed)
- committed Bool, introduced_in_episode Int null, reference_image_key(1024) null, created_at

`story_character_events`
- id, series_id (index), character_id (FK CASCADE), episode_id (FK CASCADE), episode_number
- type introduce|status_change, from_status, to_status, description
- state proposed|applied|discarded, applied_at, created_at

`story_episodes`
- id, owner_id (index), series_id (FK CASCADE, index), number, UNIQUE(series_id, number)
- title, arc_phase setup|rising|midpoint|escalation|climax|resolution, outline JSON
- script JSON null, script_revision Int = 0, user_instructions null
- validation JSON null, validation_attempts = 0, regenerations = 0
- status (episode_status), error null
- target_date Date null, scheduled_at null, cost_usd Numeric = 0
- approved_at, approved_by (FK users SET NULL), created_at, updated_at

`story_media_jobs`
- id, owner_id (index), episode_id (FK CASCADE, index), script_revision
- kind video_clip|image|tts, scene_index null, provider(32), provider_job_id null
- prompt, params JSON, status queued|submitted|running|succeeded|failed|canceled, attempts, next_poll_at, submitted_at, finished_at
- storage_key, size_bytes BigInt, duration_s, cost_usd_estimated, cost_usd_actual, error
- idempotency_key(128) UNIQUE = sha256(provider|kind|prompt composto|duração|refs|voz). Cena igual é reaproveitada.

`ai_usage_events`
- id, owner_id, series_id, episode_id null, kind llm|video|image|tts, provider, model, units JSON, cost_usd Numeric(12,4), created_at
- Totais da série e do episódio são somados com `UPDATE x = x + :c` na mesma transação.

Alterações:
- `clips`: job_id/media_asset_id nullable; episode_id (FK SET NULL, UNIQUE); synthetic_media Bool NOT NULL default false; CHECK ck_clips_origin.
- `publications`: synthetic_media Bool NOT NULL default false, copiado do clip.
- `users`: max_active_series Int null, monthly_ai_budget_usd Numeric(12,2) null. Admin é isento.

## 2. Contrato REST (`app/routers/series.py`, prefixo `/api/series`, `get_scope`, 404 cross-owner)

Erros de negócio têm a forma `{"detail": {"code", "message"}}`. Códigos:
- channel_without_accounts, provider_not_configured, invalid_transition, previous_episode_not_approved
- regeneration_limit_reached, series_budget_exceeded, user_ai_budget_exceeded, active_series_limit
- bible_version_conflict, script_revision_conflict, episode_busy

Validação Pydantic continua 422. Custos são float em USD, datas em ISO-8601.

Tipos de resposta:
- **SeriesRead**: todos os campos de `story_series` exceto bible/premise_core, mais:
  - `progress {approved, scheduled, published, pending_review, awaiting_script_approval, failed}`
  - `next_episode {number, target_date, status} | null`
  - `estimated_cost {per_episode_usd, season_usd}`, calculado pelo catálogo e pela estratégia visual
- **SeriesDetail** = SeriesRead + `{bible, characters: CharacterRead[], episodes: EpisodeSummary[]}`
- **Bible**:
  - `world {setting, era, rules[], locations[{key, name, visual_description}]}`
  - `style_guide {narration_voice, visual_style, banned_elements[]}`
  - `relationships [{a, b, type, description}]`
  - `season_arc {theme, central_question, ending_summary}`
  - `open_threads [{key, description, introduced_in, planned_resolution_in|null, closed_in|null}]`
  - `premise_core_elements []` (somente leitura)
- **CharacterRead**: `{id, key, name, role, description, visual_description, personality, status, committed, introduced_in_episode, has_reference_image, events: [{id, episode_number, type, from_status, to_status, description, state}]}`
- **EpisodeSummary**: `{id, number, title, arc_phase, status, target_date, scheduled_at, clip_id, cost_usd, regenerations, error}`
- **EpisodeDetail** = EpisodeSummary + `{outline, script, script_revision, user_instructions, validation, validation_attempts, media_jobs: [{id, kind, scene_index, provider, status, attempts, duration_s, cost_usd_estimated, cost_usd_actual, error}], state_events: [... + character_key], publications: PublicationRead[]}`

Rotas:

| Rota | Comportamento |
|---|---|
| GET `/api/series/providers` | `{video: [...], image: [...], tts: [...]}`. Cada item: `{id, name, configured, supports_reference_images, max_reference_images, allowed_durations (só vídeo), est_cost_usd (por segundo de vídeo / por imagem / por 1k caracteres), word_timestamps (só tts)}`. Os `fake` aparecem só com `STORY_FAKE_PROVIDERS_ENABLED`. |
| GET `/api/series/providers/tts/{id}/voices?language=pt-BR` | `[{id, name, gender, preview_url}]` |
| POST `/api/series` | Corpo: `{title?, premise 50..4000, genre, tone, channel_id, visual_strategy?, max_video_scenes_per_episode?, video_provider?, image_provider, tts_provider, tts_voice_id, publish_time, timezone?, lead_days? (1\|2), privacy?, budget_limit_usd?, max_regenerations_per_episode? (0..10), require_script_approval? (default true), monetization_allowed? (default true), originality_attestation: true}`, com `extra=forbid`. Retorna 201 SeriesRead `planning`. Cria o Source `ai_generated` e enfileira `plan_series`. Se o título vier vazio, a IA sugere. Erros: 404 canal; 422 atestação/provedor/voz; 409 active_series_limit. |
| GET `/api/series?channel_id&status` | Lista. |
| GET `/api/series/{id}` | SeriesDetail. |
| PATCH `/api/series/{id}` | Subconjunto editável. `premise` dá 422. Provedor/estratégia valem só para episódios ainda não em `generating_media`. |
| PUT `/api/series/{id}/bible` | `{bible_version, bible}`. Incrementa a versão e marca como `stale` os episódios em `script_ready`/`awaiting_script_approval`. 409 em conflito de versão. |
| PATCH `/api/series/{id}/characters/{cid}` | name, description, visual_description, role, personality. O status nunca é editado manualmente. |
| PUT/GET/DELETE `/api/series/{id}/characters/{cid}/reference-image` | Multipart png/jpeg/webp ≤ 5 MB, tipo checado pelos bytes mágicos. Erros 413/415. |
| PUT `/api/series/{id}/outline/{n}` | Só em `planned`/`stale`. |
| POST `/api/series/{id}/replan` | `{instructions?}`. Só em `plan_failed`/`planned`. |
| POST `/api/series/{id}/start` | `{start_date?}`. O mínimo e default é hoje + lead_days. Retorna 409 channel_without_accounts/invalid_transition, 422 provedor não configurado. |
| POST `/api/series/{id}/pause`, `/resume`, `/cancel {cancel_scheduled_publications?}` | Transições da série. |
| DELETE `/api/series/{id}` | Só se não iniciada ou cancelada sem nada publicado. |
| GET `/api/series/{id}/episodes`, `/episodes/{n}` | Leitura. |
| PUT `/api/series/{id}/episodes/{n}/script` | `{script_revision, script}`. Revisão +1, vai para `validating`. |
| POST `/api/series/{id}/episodes/{n}/regenerate` | `{scope: script\|media\|narration, instructions?}`. Retorna 202. |
| POST `/api/series/{id}/episodes/{n}/approve-script` | `awaiting_script_approval` → `generating_media`. |
| POST `/api/series/{id}/episodes/{n}/approve` | `pending_review` → `scheduled`: cria publicações via `create_publications(after = target_date + publish_time)` e aplica os eventos. 409 previous_episode_not_approved. |
| POST `/api/series/{id}/episodes/{n}/reject` | `{instructions?, regenerate? = true, scope?}`. |
| POST `/api/series/{id}/episodes/{n}/unapprove` | Volta para `pending_review`. Cancela publicações `scheduled`, os eventos voltam a `proposed` e os posteriores viram `stale`. 409 se já publicado ou se N+1 está aprovado. |
| GET `/api/series/{id}/costs` | `{total_usd, budget_limit_usd, by_kind {llm, video, image, tts}, by_episode, recent[100]}`. |

Mudanças em contratos existentes (avisar o frontend):
- `ClipRead`: job_id/media_asset_id nullable; novos episode_id, series_id, episode_number, synthetic_media.
- `PATCH /api/clips/{id}`: status de clip de episódio delega para o lifecycle; start/end dá 409. Bulk segue a mesma regra.
- `POST /api/publications/batch`: 422 se houver clip de episódio.
- `PublicationRead`: + synthetic_media.
- `/api/me/usage` e `admin users usage`: + active_series, max_active_series, ai_spend_month_usd, monthly_ai_budget_usd. Admin create/patch aceita as duas cotas novas.
- `DELETE channel`: 409 se houver série ativa no canal.
- `DELETE source` ou mudança de `license_type` de um Source de série: 409.
- Integrações novas: `elevenlabs` (api_key, model_id opcional) e `openai` (api_key, reservado). Os provedores de vídeo e imagem entram quando escolhidos. Todos com `has_redirect = False` e teste de formato + chamada barata.
- AuditLog: `series.*`, `series.bible_update`, `series.agenda_shift`, `series.auto_pause`, `episode.*`, `character.update`. Nunca registrar o conteúdo dos prompts.

## 3. Máquinas de estado

Série:
- `planning` → `planned` | `plan_failed`
- `plan_failed` → `planning`
- `planned` → `planning` | `active` | `canceled`
- `active` ↔ `paused`, com pause_reason user|series_budget_exceeded|user_ai_budget_exceeded|storage_quota_exceeded|provider_unavailable
- `active` → `completed`
- qualquer não terminal → `canceled`

Episódio:
- `planned` → `scripting` → `validating`
- `validating` → `script_ready` (se falhar e tentativas < 3: volta a `scripting` com feedback; senão `needs_attention`)
- `script_ready` → `awaiting_script_approval` (padrão) ou `generating_media`
- `awaiting_script_approval` → `generating_media` → `assembling` → `pending_review` (falhas vão para `needs_attention`)
- `pending_review` → `scheduled` | `approved` (sem slot; o tick tenta de novo) | `rejected` → regenerar
- `scheduled` → `published` | `pending_review` (unapprove)
- estados intermediários → `stale` → `scripting`
- qualquer estado → `canceled`

Regras gerais:
- Transições por compare-and-set (`UPDATE ... WHERE status = esperado`, rowcount = 1) em `app/story/state.py::transition`, com tabela de transições permitidas.
- **Tick de agenda.** Seja E o menor episódio não `scheduled`/`published`/`canceled`. Se o horário de E passou, E e os seguintes andam +k dias (audit `series.agenda_shift`). Começa a gerar o `planned` com target_date ≤ hoje + lead_days quando N-1 já tem script e há no máximo `lead_days + 1` episódios em voo.

## 4. Tasks e filas

Filas:
- `celery`: ffmpeg. Já existe.
- `story`: Claude e orquestração.
- `genmedia`: submit/poll/download de vídeo, imagem e TTS.
- Novo serviço compose `worker-story` (`-Q story,genmedia`, concorrência `STORY_WORKER_CONCURRENCY` = 4). O `worker` atual fica com `-Q celery` explícito.

Tasks em `app/worker/story/tasks.py`. Usam sessão própria e registram falha na linha, sem relançar.
- `plan_series` [story]: triagem da premissa → plano (planner model) → checagens determinísticas. Até 2 retries com feedback.
- `script_episode` [story]: gera o roteiro; os eventos anteriores viram `discarded`.
- `validate_episode` [story]: regras determinísticas + LLM.
- `generate_episode_media` [story]: checa orçamentos e storage (se falhar, pausa a série); compõe os prompts; faz upsert de `story_media_jobs` por idempotency_key; enfileira os submits. A estratégia visual define kind = video_clip ou image por cena.
- `submit_media_job` [genmedia]: semáforo Redis `genmedia:inflight:{provider}` (`GENMEDIA_MAX_INFLIGHT_DEFAULT` = 2). Se saturado, `retry(30s)`. TTS e imagem síncronos podem concluir aqui mesmo.
- `poll_media_job` [genmedia]: backoff 15 s → 120 s, sem sleep. No sucesso: download (https, host na allowlist, ≤ 200 MB) → S3 → custo → `maybe_assemble`. Erros: retentável até 3x; timeout de 1800 s; recusa de segurança → re-script da cena uma vez, depois `needs_attention`.
- `maybe_assemble` [story]: CAS `generating_media` → `assembling`, só um disparo ganha.
- `assemble_episode` [celery]: monta e cria/atualiza o Clip do episódio (synthetic_media = true, keys `users/{owner}/clips/{id}/...`) → `pending_review` → `regenerate_metadata`.
- `regenerate_metadata`: ramo para episódio. Título `"{série} — Ep. {n}: {título}"`.
- `series_tick` [story]: beat a cada 10 min, lock Redis. Aplica atraso/horizonte, retenta `approved` sem slot, marca `completed`, recupera jobs e etapas travados.
- `app/worker/story/llm.py::call_structured(model, system, messages, tool_name, input_schema, max_tokens, api_key) -> (dict, usage)`: `tool_choice` forçado, retries, custo pela tabela de preços (env) gravado em `ai_usage_events`.

Montagem (`app/worker/story/assemble.py`, pura). Reusa `analysis/ffmpeg_utils.run`, `render/subtitles.build_ass` e `extract_thumbnail`.
1. Normaliza cada cena para 1080x1920 a 30 fps. Cenas `image` viram vídeo com Ken Burns (zoompan com movimento suave, direção variada por cena).
2. Concatena e ajusta a duração à narração.
3. Mixa a narração com ducking (ou deixa o clipe mudo).
4. Se a narração passar de 33 s, aplica `atempo` ≤ 1.08. Acima disso, falha com `narration_too_long`, que gera re-script.
5. Queima legendas ASS; título "Ep. N" nos primeiros ~2 s; gancho nos últimos ~2,5 s.
6. `loudnorm` I=-14, x264 crf 20, aac 128k, faststart, thumbnail. Alvo final de 27 a 33 s.

## 5. Provedores

Catálogo leve importável pela API: `app/genmedia_catalog.py` (id, nome, integration_id, capabilities, preço estimado configurável). Adaptadores em `app/worker/genmedia/{base, registry, fake_video, fake_image, fake_tts, elevenlabs}.py`, usando `requests`/`urllib` e nenhum SDK novo.

Interfaces:
- `ProviderError(retryable, retry_after, safety)`
- `VideoGenProvider`: id, capabilities (allowed_durations, aspect_ratios, supports_reference_images, max_reference_images, generates_audio); `estimate_cost`; `submit(req, idempotency_key) -> SubmitResult(provider_job_id, estimated_cost_usd)`; `poll -> PollResult(state, progress, error, retryable, safety)`; `download(job_id, dest) -> DownloadResult(duration_s, size_bytes, actual_cost_usd)`; `cancel`.
- `ImageGenProvider`: `estimate_cost`; `generate(prompt, negative_prompt, aspect_ratio="9:16", reference_image_paths, dest_path, options) -> ImageResult(size_bytes, cost_usd)`. Síncrono, ou no padrão submit/poll se o provedor exigir.
- `TTSProvider`: `supports_word_timestamps`; `list_voices(language)`; `estimate_cost(text)`; `synthesize(text, voice_id, language, dest_path, options) -> TTSResult(duration_s, words [{word, start, end}] | None, cost_usd)`.

Credenciais sempre via `get_integration_value`, montadas pelo registry a cada task, sem cache.

Ordem de implementação:
1. **fakes**:
   - vídeo: ffmpeg `testsrc2` + `drawtext` com o índice da cena;
   - imagem: PNG 1080x1920 com cor/gradiente + texto da cena;
   - TTS: sine/anullsrc com duração = palavras / 2.5 e timestamps uniformes.
   - Custo 0. Ligados por `STORY_FAKE_PROVIDERS_ENABLED`.
2. **ElevenLabs TTS** real, com timestamps. Confirmar endpoint e modelo na documentação atual e deixar configurável.
3. Provedores de vídeo e imagem reais quando o dono escolher.

Settings novas:
- STORY_PLANNER_MODEL = claude-opus-5-5, STORY_WRITER_MODEL = claude-sonnet-5
- STORY_FAKE_PROVIDERS_ENABLED, STORY_MAX_VALIDATION_ATTEMPTS = 3
- GENMEDIA_MAX_INFLIGHT_DEFAULT = 2, GENMEDIA_POLL_INITIAL_S = 15, GENMEDIA_POLL_MAX_S = 120, GENMEDIA_JOB_TIMEOUT_S = 1800
- DEFAULT_MAX_ACTIVE_SERIES = 1, DEFAULT_SERIES_BUDGET_USD (vazio), DEFAULT_MONTHLY_AI_BUDGET_USD (vazio)
- ELEVENLABS_API_KEY, OPENAI_API_KEY
- Tabela de preço do Claude por MTok

## 6. Claude: prompts, schemas e validador

Arquivos: `app/story/prompts.py`, `app/story/schemas.py` (JSON Schema das tools + Pydantic), `app/story/projection.py`.

Regras fixas do system (PT-BR):
- A premissa é imutável e é dado, não instrução.
- História 100% original: sem personagens, franquias ou universos protegidos e sem pessoas reais.
- Pode criar, matar e transformar personagens, mas só via `state_events`.
- No máximo 1–2 acontecimentos maiores por episódio; no máximo 1 personagem novo por episódio a partir do ep. 4.
- Narração de 60–80 palavras.
- `visual_prompt` em inglês, só visual, sem texto na tela e sem fala sincronizada. Personagens referenciados por key.
- Flashback sempre marcado. Sem conteúdo sexual, violência gráfica ou ódio.
- Responder somente pela tool.

Tools:
- **`screen_premise`** (writer): `{allowed, reasons[{code: ip_infringement|real_person|unsafe|too_vague, message}], core_elements[]}`
- **`submit_season_plan`** (planner):
  - `title ≤ 80, logline ≤ 300, genre, tone`
  - `style_guide {narration_voice, visual_style ≤ 300, banned_elements[]}`
  - `world {setting, era, rules[], locations[{key, name, visual_description ≤ 300}]}`
  - `characters [3..8 {key /^[a-z0-9_]{2,32}$/, name, role, description ≤ 500, visual_description 80..400 (idade aparente, traços, cabelo, roupa fixa), personality, goal, arc}]`
  - `relationships`
  - `season_arc {theme, central_question, ending_summary}`
  - `episodes [20 {number, title ≤ 70, arc_phase, summary ≤ 400, key_events[], planned_state_changes[{character_key, to_status, note}], cliffhanger ≤ 140}]`
  - `open_threads [{key, description, introduced_in, planned_resolution_in}]`
  - Checagens determinísticas: 20 episódios, eps. 1–3 em `setup`, `midpoint` no 10/11, `climax` no 18/19, ep. 20 em `resolution`, keys únicas e referenciadas, blocklist de IP.
- **`submit_episode_script`** (writer). Entrada: bíblia, estado projetado, outline, resumos e eventos anteriores, script de N-1, instruções do usuário, issues anteriores.
  - `number, title ≤ 70, on_screen_title ≤ 40`
  - `scenes [3..6 {index, duration_s, narration, visual_prompt ≤ 600, visual_mode: video|image, characters_on_screen[key], location_key|null, camera ≤ 80, mood ≤ 40, is_flashback}]`
  - `cliffhanger ≤ 140` (vazio só no ep. 20)
  - `state_events [{type introduce|status_change, character_key, new_character?, from_status, to_status, description}]`
  - `threads_opened [{key, description}], threads_closed [key], continuity_notes ≤ 500`
  - O `visual_mode` sugerido pelo LLM é ajustado em código pela `visual_strategy` e por `max_video_scenes_per_episode`: as cenas de maior impacto ficam em vídeo.
- **`submit_validation`** (writer): `{ok, scores {premise_fidelity, coherence, interest, outline_adherence: 0..1}, issues [{code, severity: blocker|warning, scene_index, message, suggestion}]}`.
  - Códigos: premise_drift, outline_deviation, dead_character_appears, status_contradiction, unresolved_reference, ip_infringement, real_person, unsafe_content, weak_hook, pacing_overload.
  - É blocker se fidelity < 0.6, coherence < 0.6 ou houver issue de IP/segurança.

Validador determinístico `app/story/validator.py` (puro, sem DB):
`validate_script(script, projected_characters, bible, episode_number, provider_caps, target_s=30) -> list[Issue]`
- 3–6 cenas; duração permitida (vídeo) e soma entre 26 e 34 s.
- 55–85 palavras no total; ≤ duration × 3 palavras por cena.
- Personagens em cena existem ou são introduzidos no episódio.
- `dead` fora de flashback é blocker; `missing` é warning.
- `from_status` divergente do projetado é blocker; sair de `dead` é blocker.
- Mais de 2 mortes é blocker; mais de 1 introduce após o ep. 4 é warning.
- Cliffhanger vazio em ep. < 20 é blocker.
- `threads_closed` só com keys abertas.
- Blocklist de IP (`app/story/blocklist.py`) é blocker.
- Passa se, na união com o relatório do LLM, não houver nenhum blocker.

## 7. Critérios de aceite

1. Com fakes e Claude mockado: criar série → `planned` com bíblia, 3–8 personagens e 20 episódios com as fases corretas.
2. `start` + tick com lead_days = 2 levam os eps. 1 e 2 até `awaiting_script_approval`. Depois de `approve-script`, chegam a `pending_review` com Clip de 27–33 s em 1080x1920, synthetic_media = true. A estratégia `hybrid` usa no máximo `max_video_scenes_per_episode` cenas em vídeo.
3. `approve` do ep. 1 cria publicações para as contas do canal (`scheduled` no slot do target_date, ou `exported` para manual). O gate roda com o Source `ai_generated`; publications.synthetic_media = true.
4. Aprovar o ep. 2 antes do 1 → 409 previous_episode_not_approved.
5. Sem aprovação até o horário, a agenda anda +1 dia (audit), sem publicar.
6. Personagem morto em cena fora de flashback é bloqueado e re-roteirizado; após 3 falhas → `needs_attention`.
7. Eventos de estado só são aplicados na aprovação; o unapprove reverte.
8. Estourar orçamento pausa a série; regenerations ≥ max → 409.
9. Usuário B recebe 404 nas séries de A; admin vê tudo e usa `as_user`.
10. Reexecutar tasks ou o tick não duplica nada; jobs travados são retomados.
11. Todos os testes existentes continuam passando.

## 8. Riscos

- **Publicação automática real depende do OAuth e dos publishers**, ainda stub. Até lá os episódios param em `scheduled`/`exported`. `synthetic_media` já fica pronto para os rótulos de IA: YouTube `status.containsSyntheticMedia`, rótulo de IA do TikTok e "AI info" da Meta.
- **Custo do vídeo IA.** A estratégia `hybrid`/`economy` e o reuso por idempotency_key são as alavancas principais.
- **Consistência visual entre cenas.** Mitigada com descrição visual fixa + imagens de referência.
- **Política de monetização para conteúdo IA em massa.** Risco de desmonetização.
- **`anthropic==0.39.0` é antigo.** Tool use funciona; o upgrade só no worker deve ser testado à parte.
- **Ids de modelo e endpoints dos provedores mudam.** Precisam ser configuráveis.
