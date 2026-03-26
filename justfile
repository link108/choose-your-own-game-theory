# Game Theory Simulator

set dotenv-load

app_dir := "app"
image_name := "game-theory-sim"
container_name := "game-theory-sim"

# ---- Prisma ----

# Run prisma migrate dev
prisma-migrate:
    cd {{app_dir}} && pnpm db:migrate

# Reset database (drop all data, re-run migrations, re-seed)
prisma-reset:
    cd {{app_dir}} && pnpm exec prisma migrate reset --force

# ---- Server ----

# Start the dev server (background)
server-start:
    cd {{app_dir}} && pnpm dev &
    @echo "Dev server starting on http://localhost:3000"

# Stop the dev server
server-stop:
    -pkill -f "next dev" 2>/dev/null || true
    @echo "Dev server stopped"

# ---- Docker ----

# Build the Docker image
docker-build:
    docker build -t {{image_name}} {{app_dir}}

# Start the container (expects DATABASE_URL env var)
docker-start:
    docker run -d \
        --name {{container_name}} \
        --env-file {{app_dir}}/.env \
        -p 3000:3000 \
        {{image_name}}
    @echo "Container started on http://localhost:3000"

# Stop and remove the container
docker-stop:
    -docker stop {{container_name}} 2>/dev/null || true
    -docker rm {{container_name}} 2>/dev/null || true
    @echo "Container stopped"
