# Single source of code for both the API and the worker/beat: they share the
# same models, schemas, rights gate and settings (see app/worker/*). Build
# with `--target api` or `--target worker` (docker-compose.yml sets this).

FROM python:3.12-slim AS base
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# ---- api: FastAPI HTTP server ----
FROM base AS api
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ---- worker: Celery worker/beat. Needs ffmpeg + room for heavier ML deps
# (see requirements-worker.txt) that the API image doesn't need. ----
FROM base AS worker

# ffmpeg (cut/reframe/subtitles/loudnorm, built with libass so `-vf ass=...`
# burns subtitles), libglib2.0-0 (opencv-python-headless's runtime dep even
# though it's "headless" — cv2 still dlopen()s it), fonts-dejavu-core (a
# concrete font file for libass to rasterize the burned-in subtitles with,
# see app/worker/render/subtitles.py's Fontname).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libglib2.0-0 \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-worker.txt ./
RUN pip install --no-cache-dir -r requirements-worker.txt

CMD ["celery", "-A", "app.worker.celery_app.celery_app", "worker", "--loglevel=INFO"]
