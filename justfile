# Game Theory Simulator

set dotenv-load

app_dir := "app"
image_name := "game-theory-sim"
container_name := "game-theory-sim"
compose_file := "compose.dev.yaml"

# ---- Prisma ----

# Run prisma migrate dev
prisma-migrate:
    cd {{app_dir}} && pnpm db:migrate

# Reset database (drop all data, re-run migrations, re-seed)
prisma-reset:
    cd {{app_dir}} && pnpm exec prisma migrate reset --force

# ---- Server (local, no docker) ----

# Start the dev server (background)
server-start:
    cd {{app_dir}} && pnpm dev &
    @echo "Dev server starting on http://localhost:3000"

# Stop the dev server
server-stop:
    -pkill -f "next dev" 2>/dev/null || true
    @echo "Dev server stopped"

# ---- Docker (production image) ----

# Build the production Docker image
docker-build:
    docker build -t {{image_name}} {{app_dir}}

# Start the production container
docker-start:
    docker run -d \
        --name {{container_name}} \
        --env-file {{app_dir}}/.env \
        -p 3000:3000 \
        {{image_name}}
    @echo "Container started on http://localhost:3000"

# Stop and remove the production container
docker-stop:
    -docker stop {{container_name}} 2>/dev/null || true
    -docker rm {{container_name}} 2>/dev/null || true
    @echo "Container stopped"

# ---- Dev Environment (compose: app + postgres) ----
# Use `name` to run parallel isolated environments:
#   just dev-up                   → default instance on port 3000
#   just dev-up myenv 3001        → "myenv" instance on port 3001
#   just dev-up agent-a 3002      → "agent-a" instance on port 3002

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
    docker compose -f {{compose_file}} -p game-theory-{{name}} exec app pnpm db:migrate

# Run prisma seed inside a dev environment
dev-seed name="default":
    docker compose -f {{compose_file}} -p game-theory-{{name}} exec app pnpm db:seed

# Open a shell in the app container
dev-shell name="default":
    docker compose -f {{compose_file}} -p game-theory-{{name}} exec app sh

# List all running dev environments
dev-list:
    @docker compose ls --filter "name=game-theory-*" 2>/dev/null || docker ps --filter "label=com.docker.compose.project" --format "table {{{{.Names}}}}\t{{{{.Status}}}}\t{{{{.Ports}}}}" | grep game-theory || echo "No dev environments running"
