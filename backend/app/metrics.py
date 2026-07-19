"""Low-cardinality Prometheus metric contract for the API and its dependencies."""

import time
from importlib.metadata import PackageNotFoundError, version

from prometheus_client import Counter, Gauge, Histogram

HTTP_DURATION_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 120)
DEPENDENCY_DURATION_BUCKETS = (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 120)
DATABASE_DURATION_BUCKETS = (0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5)
BACKGROUND_JOB_DURATION_BUCKETS = (1, 5, 15, 30, 60, 120, 300, 600, 900)

HTTP_SERVER_REQUESTS = Counter(
    "http_server_requests_total",
    "HTTP requests completed by the application.",
    ("method", "route", "status_code"),
)
HTTP_SERVER_REQUEST_DURATION = Histogram(
    "http_server_request_duration_seconds",
    "HTTP request duration from receipt through response completion.",
    ("method", "route", "status_code"),
    buckets=HTTP_DURATION_BUCKETS,
)

DEPENDENCY_REQUESTS = Counter(
    "dependency_requests_total",
    "Calls to external dependencies.",
    ("dependency", "operation", "outcome"),
)
DEPENDENCY_REQUEST_DURATION = Histogram(
    "dependency_request_duration_seconds",
    "External dependency call duration.",
    ("dependency", "operation"),
    buckets=DEPENDENCY_DURATION_BUCKETS,
)
DATABASE_QUERY_DURATION = Histogram(
    "database_query_duration_seconds",
    "Database statement duration by statement operation.",
    ("operation",),
    buckets=DATABASE_DURATION_BUCKETS,
)
CACHE_REQUESTS = Counter(
    "cache_requests_total",
    "Requests to application caches.",
    ("cache", "result"),
)
BACKGROUND_JOBS = Counter(
    "background_jobs_total",
    "Background job runs.",
    ("job", "outcome"),
)
BACKGROUND_JOB_DURATION = Histogram(
    "background_job_duration_seconds",
    "Background job run duration.",
    ("job",),
    buckets=BACKGROUND_JOB_DURATION_BUCKETS,
)

SCENARIOS_CREATED = Counter(
    "scenarios_created_total", "User-authored scenarios committed to the database."
)
PLAYTHROUGHS_STARTED = Counter(
    "playthroughs_started_total",
    "Playthrough start attempts by bounded outcome.",
    ("outcome",),
)
PLAYTHROUGHS_COMPLETED = Counter(
    "playthroughs_completed_total", "Playthroughs committed in the completed state."
)
PLAYTHROUGHS_ABANDONED = Counter(
    "playthroughs_abandoned_total", "Active playthroughs committed as abandoned."
)
ANALYSES_GENERATED = Counter(
    "analyses_generated_total",
    "New AI analyses committed to the database.",
    ("analysis_type",),
)
LIVING_SCENARIO_UPDATES = Counter(
    "living_scenario_updates_total",
    "Living-scenario update evaluations by bounded outcome.",
    ("outcome",),
)
NOTIFICATIONS_SENT = Counter(
    "notifications_sent_total",
    "Transactional notification attempts by delivery outcome.",
    ("channel", "outcome"),
)

APPLICATION_BUILD_INFO = Gauge(
    "application_build_info",
    "Application build identity.",
    ("version", "git_sha"),
)


def package_version() -> str:
    """Return installed project metadata, including for uv editable environments."""
    try:
        return version("cyoa-backend")
    except PackageNotFoundError:
        return "unknown"


def set_build_info(application_version: str, git_sha: str) -> None:
    APPLICATION_BUILD_INFO.labels(
        version=application_version or package_version(), git_sha=git_sha or "unknown"
    ).set(1)


def observe_dependency(dependency: str, operation: str, outcome: str, started_at: float) -> None:
    """Record one dependency attempt using only caller-supplied bounded values."""
    DEPENDENCY_REQUESTS.labels(dependency, operation, outcome).inc()
    DEPENDENCY_REQUEST_DURATION.labels(dependency, operation).observe(
        time.perf_counter() - started_at
    )


def llm_operation(kind: str) -> str:
    """Collapse dynamic generation kinds (including turn numbers) to a fixed set."""
    if kind.startswith("resolve_turn_"):
        return "resolve_turn"
    if kind.startswith("suggest_action_"):
        return "suggest_action"
    return (
        kind
        if kind
        in {
            "analysis",
            "context_intake",
            "initial_turn",
            "living_update",
            "scenario_draft",
            "scenario_progress",
        }
        else "other"
    )


class PrometheusMiddleware:
    """Pure ASGI middleware so the matched FastAPI route template is available."""

    _METHODS = {"DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"}

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started_at = time.perf_counter()
        status_code = 500

        async def capture_status(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, capture_status)
        finally:
            route = scope.get("route")
            route_template = getattr(route, "path", None) or "__unmatched__"
            method = scope["method"] if scope["method"] in self._METHODS else "OTHER"
            labels = (method, route_template, str(status_code))
            HTTP_SERVER_REQUESTS.labels(*labels).inc()
            HTTP_SERVER_REQUEST_DURATION.labels(*labels).observe(time.perf_counter() - started_at)
