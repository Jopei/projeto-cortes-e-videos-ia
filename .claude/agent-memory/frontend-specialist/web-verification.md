---
name: web-verification
description: How to verify apps/web against the live stack (cookie login without exposing password, web port, lint/build commands)
metadata:
  type: reference
---

- Web scripts: `npm run lint`, `npx tsc --noEmit`, `npm run build` in apps/web (no test script). Web container: `docker compose up -d --build web`, served on localhost:13000; API on localhost:18000.
- Admin cookie without printing the password: run python inside `docker compose exec -T api` reading ADMIN_USERNAME/ADMIN_PASSWORD from env, POST /api/auth/login on localhost:8000, write only the `cortes_session` value to a scratchpad file, then curl with `Cookie: cortes_session=...`.
- Unmapped FastAPI routes answer 404 `{"detail":"Not Found"}` exactly; lib/series-errors.ts `isUnavailable` relies on that to show "recurso ainda indisponível".
- Dialog is stackable (module-level stack) and supports `variant="drawer"` and `data-autofocus` for the safe button.
- Temp-user cleanup: soft delete is blocked by FKs. Delete rows via `docker compose exec -T postgres psql`: ai_usage_events (owner_id), audit_log (user_id or entity_id = uid), then users. Domain tables: story_series/episodes/media_jobs, sources, channels, platform_accounts.
- UI primitives: `.btn .btn-{primary,secondary,ghost,success,danger,danger-outline} .btn-sm`, `.field-control`, `.focus-ring` live in globals.css (@layer components); tokens (bg-surface, text-fg-muted, border-border...) in tailwind.config.ts. Dashboard summary has optional `attention` block (lib/dashboard.ts).
