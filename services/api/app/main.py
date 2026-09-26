from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

from app.routers import health, media_assets, sources, uploads

app = FastAPI(title="Projetos Cortes API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(sources.router)
app.include_router(media_assets.router)
app.include_router(uploads.router)
