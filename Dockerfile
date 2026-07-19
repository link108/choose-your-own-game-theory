# Stage 1: build the SPA
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: API + static frontend in one image
FROM python:3.13-slim
ARG APPLICATION_VERSION=0.1.0
ARG GIT_SHA=unknown
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /srv/backend

COPY backend/pyproject.toml backend/uv.lock* ./
RUN uv sync --no-dev

COPY backend/ ./
COPY --from=frontend /frontend/dist /srv/static

ENV STATIC_DIR=/srv/static \
    APPLICATION_VERSION=${APPLICATION_VERSION} \
    GIT_SHA=${GIT_SHA}
EXPOSE 8000

# migrations run at container start so k3s deploys stay a single step
CMD ["sh", "-c", "uv run --no-sync alembic upgrade head && uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port 8000"]
