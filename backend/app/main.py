from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, Response
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.config import get_settings
from app.metrics import PrometheusMiddleware, package_version, set_build_info
from app.routers import admin, auth, catalog, playthroughs, scenarios, stats


def _operation_id(route: APIRoute) -> str:
    """Route names as operation ids, so generated clients (Swift/TS) get clean method
    names; a snapshot test asserts they stay unique."""
    return route.name


app = FastAPI(title="CYOA Scenario Platform", generate_unique_id_function=_operation_id)
app.add_middleware(PrometheusMiddleware)

app.include_router(auth.router)
app.include_router(scenarios.router)
app.include_router(catalog.router)
app.include_router(playthroughs.router)
app.include_router(stats.router)
app.include_router(admin.router)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    """Cheap, unauthenticated pull endpoint for vmagent."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


settings = get_settings()
set_build_info(settings.application_version or package_version(), settings.git_sha)


# In production the built SPA is baked into the image and served by FastAPI so a single
# container deploys to k3s. In dev, vite serves the frontend and proxies /api here.
static_dir = settings.static_dir
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
