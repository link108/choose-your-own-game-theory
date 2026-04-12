# Game Theory Simulator

set dotenv-load

app_dir := "app"

# Default recipe - show available commands
default:
    @just --list

# === Development ===

# Start development server
dev:
    cd {{app_dir}} && pnpm dev

# Start dev with infrastructure (docker compose up + dev)
dev-full:
    cd {{app_dir}} && pnpm dev:full

# === Database ===

# Run database migrations (production)
db-migrate:
    cd {{app_dir}} && pnpm db:migrate

# Run database migrations (development)
db-migrate-dev:
    cd {{app_dir}} && pnpm db:migrate:dev

# Generate Prisma client
db-generate:
    cd {{app_dir}} && pnpm db:generate

# Push schema changes without migrations
db-push:
    cd {{app_dir}} && pnpm db:push

# Seed the database
db-seed:
    cd {{app_dir}} && pnpm db:seed

# Open Prisma Studio
db-studio:
    cd {{app_dir}} && pnpm db:studio

# === Infrastructure ===

# Start infrastructure (docker compose)
infra-up:
    cd {{app_dir}} && pnpm infra:up

# Stop infrastructure
infra-down:
    cd {{app_dir}} && pnpm infra:down

# View infrastructure logs
infra-logs:
    cd {{app_dir}} && pnpm infra:logs

# Reset infrastructure (down -v && up)
infra-reset:
    cd {{app_dir}} && pnpm infra:reset

# Show infrastructure status
infra-status:
    cd {{app_dir}} && pnpm infra:status

# === Build & Test ===

# Build the application
build:
    cd {{app_dir}} && pnpm build

# Run linter
lint:
    cd {{app_dir}} && pnpm lint

# Fix lint issues
lint-fix:
    cd {{app_dir}} && pnpm lint:fix

# Run type checker
typecheck:
    cd {{app_dir}} && pnpm typecheck

# Run all checks (typecheck, lint)
check:
    cd {{app_dir}} && pnpm check

# Run full verification (lint, typecheck, build)
verify:
    cd {{app_dir}} && pnpm verify

# === Docker ===

# Build Docker image
docker-build:
    cd {{app_dir}} && pnpm docker:build

# Push Docker image
docker-push:
    cd {{app_dir}} && pnpm docker:push

# Build and push Docker image
docker-release: docker-build docker-push

# Run the production image locally
docker-start port="3000" db-url="postgresql://postgres:postgres@host.docker.internal:5432/game_theory?schema=public":
    docker run -d \
        --name game-theory-sim \
        --env-file .env \
        -e DATABASE_URL="{{db-url}}" \
        -p {{port}}:3000 \
        link108/game-theory-sim:latest
    @echo "Production container started on http://localhost:{{port}}"

# Stop and remove the production container
docker-stop:
    -docker stop game-theory-sim 2>/dev/null || true
    -docker rm game-theory-sim 2>/dev/null || true
    @echo "Production container stopped"

# Tail logs from the production container
docker-logs:
    docker logs -f game-theory-sim

# === Setup ===

# Install dependencies
install:
    cd {{app_dir}} && CI=true pnpm install

# Initial setup (install, db) - uses local postgres
setup:
    cd {{app_dir}} && pnpm run setup

# Fresh setup (regenerate db) - uses local postgres
setup-fresh:
    cd {{app_dir}} && pnpm run setup:fresh

# Setup with docker infrastructure
setup-docker:
    cd {{app_dir}} && pnpm run setup:docker

# Clean build artifacts
clean:
    cd {{app_dir}} && pnpm clean

# === Other ===

# Start production server
start:
    cd {{app_dir}} && pnpm start

# === Dev Environment (compose: app + postgres) ===
# Use `name` to run parallel isolated environments:
#   just dev-up                   → default instance on port 3000
#   just dev-up myenv 3001        → "myenv" instance on port 3001

compose_file := "compose.dev.yaml"

# Spin up a dev environment (app + postgres)
dev-up name="default" port="3000":
    PORT={{port}} docker compose -f {{compose_file}} -p game-theory-{{name}} up -d --build
    @echo "Dev environment '{{name}}' running on http://localhost:{{port}}"

# Tear down a dev environment
dev-down name="default":
    docker compose -f {{compose_file}} -p game-theory-{{name}} down
    @echo "Dev environment '{{name}}' stopped"

# Tear down a dev environment and delete its data
dev-destroy name="default":
    docker compose -f {{compose_file}} -p game-theory-{{name}} down -v
    @echo "Dev environment '{{name}}' destroyed (volumes removed)"

# Show logs for a dev environment
dev-logs name="default" service="app":
    docker compose -f {{compose_file}} -p game-theory-{{name}} logs -f {{service}}

# Run prisma migrate inside a dev environment
dev-migrate name="default":
    docker compose -f {{compose_file}} -p game-theory-{{name}} exec app pnpm db:migrate:dev

# Run prisma seed inside a dev environment
dev-seed name="default":
    docker compose -f {{compose_file}} -p game-theory-{{name}} exec app pnpm db:seed

# Open a shell in the app container
dev-shell name="default":
    docker compose -f {{compose_file}} -p game-theory-{{name}} exec app sh

# List all running dev environments
dev-list:
    @docker compose ls --filter "name=game-theory-*" 2>/dev/null || docker ps --filter "label=com.docker.compose.project" --format "table {{{{.Names}}}}\t{{{{.Status}}}}\t{{{{.Ports}}}}" | grep game-theory || echo "No dev environments running"
