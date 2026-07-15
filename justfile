# CYOA Scenario Platform

set dotenv-load

default:
    @just --list

# === Setup ===

# Install backend + frontend dependencies
install:
    cd backend && uv sync
    cd frontend && npm install

# === Development ===

# Start dev postgres
db-up:
    docker compose up -d postgres

# Stop dev postgres
db-down:
    docker compose down

# Run the API with reload (expects postgres up + migrations applied)
api:
    cd backend && uv run uvicorn app.main:app --reload --port 8000

# Run the frontend dev server (proxies /api to :8000)
web:
    cd frontend && npm run dev

# === Database ===

# Apply migrations
migrate:
    cd backend && uv run alembic upgrade head

# Create a new migration from model changes
migration name:
    cd backend && uv run alembic revision --autogenerate -m "{{name}}"

# Seed the scenario library from committed fixtures (backend/app/seed_data)
seed:
    cd backend && uv run python -m app.seed

# Generate library fixtures from the catalog via the AI builder (needs DEEPSEEK_API_KEY + db)
seed-generate *args:
    cd backend && uv run python -m app.seed_generate {{args}}

# Run the living-scenarios news pass once (drafts land in /admin for review)
living-run:
    cd backend && uv run python -m app.living_run

# === Quality ===

test:
    cd backend && uv run pytest

lint:
    cd backend && uv run ruff check .
    cd frontend && npx tsc -b

fmt:
    cd backend && uv run ruff format . && uv run ruff check --fix .

check: lint test

# === Docker ===

# Build the production image (API + built SPA in one container)
docker-build:
    docker build -t link108/game-theory-sim:latest .

# Run the production image against the dev postgres
docker-run:
    docker run --rm -p 8000:8000 \
        -e DATABASE_URL="postgresql+asyncpg://postgres:postgres@host.docker.internal:5433/cyoa" \
        -e DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
        link108/game-theory-sim:latest
