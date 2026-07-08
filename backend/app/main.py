from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.routers import playthroughs, scenarios

app = FastAPI(title="CYOA Scenario Platform")

app.include_router(scenarios.router)
app.include_router(playthroughs.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


# In production the built SPA is baked into the image and served by FastAPI so a single
# container deploys to k3s. In dev, vite serves the frontend and proxies /api here.
static_dir = get_settings().static_dir
if static_dir and Path(static_dir).is_dir():
    assets = Path(static_dir) / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        candidate = Path(static_dir) / path
        if path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(Path(static_dir) / "index.html")
