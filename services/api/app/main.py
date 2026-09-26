from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

from app.routers import (
    accounts,
    admin_integrations,
    admin_users,
    audit_log,
    auth,
    channels,
    clips,
    dashboard,
    health,
    jobs,
    me,
    media_assets,
    publications,
    sources,
    uploads,
)

app = FastAPI(title="Projetos Cortes API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(me.router)
app.include_router(admin_users.router)
app.include_router(admin_integrations.router)
app.include_router(sources.router)
app.include_router(channels.router)
app.include_router(media_assets.router)
app.include_router(uploads.router)
app.include_router(jobs.router)
app.include_router(clips.router)
app.include_router(accounts.router)
app.include_router(publications.router)
app.include_router(audit_log.router)
app.include_router(dashboard.router)
