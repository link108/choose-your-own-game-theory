# Observability

The FastAPI process exposes unauthenticated Prometheus text exposition at `GET /metrics`.
vmagent should scrape this endpoint through the cluster-internal Service. The application
does not push metrics or events. Scraping does not query PostgreSQL or any external service.

## Metric contract

All custom metrics are process-local. The Python client also publishes its standard Python
runtime, garbage-collector, and (on supported production Linux hosts) process metrics.

| Metric | Type | Labels and allowed values | Meaning |
| --- | --- | --- | --- |
| `http_server_requests_total` | counter | `method`: `DELETE`, `GET`, `HEAD`, `OPTIONS`, `PATCH`, `POST`, `PUT`, `OTHER`; `route`: a registered FastAPI template or `__unmatched__`; `status_code`: HTTP response code | Completed HTTP requests. |
| `http_server_request_duration_seconds` | histogram | Same as request counter | End-to-end request duration, including response production. Buckets cover 5 ms through 120 s because LLM requests can be long. |
| `dependency_requests_total` | counter | `dependency`: `deepseek`, `news_feeds`, `resend`, `apple_identity`; `operation`: values below; `outcome`: `success`, `error`, or `invalid` | External dependency attempts. An LLM retry is another attempt. |
| `dependency_request_duration_seconds` | histogram | `dependency`, `operation` as above | External dependency latency, 10 ms through 120 s. |
| `database_query_duration_seconds` | histogram | `operation`: `select`, `insert`, `update`, `delete`, `other` | SQL statement latency. SQL text and parameters are never labels. |
| `cache_requests_total` | counter | `cache`: `llm_response`; `result`: `hit`, `miss` | Lookups in the PostgreSQL-backed exact-prompt LLM response cache. |
| `background_jobs_total` | counter | `job`: `living_scenario_update`; `outcome`: `success`, `partial_failure`, `failure` | Living update passes run inside the instrumented process. |
| `background_job_duration_seconds` | histogram | `job`: `living_scenario_update` | Whole living update pass duration, 1 s through 15 min. |
| `application_build_info` | gauge | `version`: application release; `git_sha`: source revision | Always `1` for the running build. No timestamp is attached. |
| `scenarios_created_total` | counter | none | User-authored scenarios committed to PostgreSQL. |
| `playthroughs_started_total` | counter | `outcome`: `success`, `validation`, `unavailable`, `internal` | Start attempts. `success` is emitted after commit; bounded failures are emitted when mapped to the API error or propagated as an unexpected server error. |
| `playthroughs_completed_total` | counter | none | Playthroughs whose completed state and final turn were committed. |
| `playthroughs_abandoned_total` | counter | none | Previously active playthroughs committed as abandoned. Repeated abandon calls do not increment it. |
| `analyses_generated_total` | counter | `analysis_type`: `playthrough`, `progress` | Newly generated analyses committed to PostgreSQL. Returning an existing stored playthrough analysis does not increment it. |
| `living_scenario_updates_total` | counter | `outcome`: `drafted`, `no_change`, `failed` | Per-scenario living-news evaluations. `drafted` is emitted after the draft commit. |
| `notifications_sent_total` | counter | `channel`: `email`; `outcome`: `sent`, `failed`, `skipped` | Transactional email attempts. `sent` means Resend accepted the request; `skipped` means Resend is intentionally disabled. |

DeepSeek `operation` values are `analysis`, `context_intake`, `initial_turn`,
`living_update`, `resolve_turn`, `scenario_draft`, `scenario_progress`, `suggest_action`,
and `other`. Dynamic turn numbers are collapsed into `resolve_turn` or `suggest_action`.
The remaining dependency/operation pairs are `news_feeds/fetch_feed`,
`resend/send_email`, and `apple_identity/verify_token`. An Apple token rejected during
cryptographic verification uses outcome `invalid`.

The scrape layer owns `service`, `environment`, and target `version` labels. The application
does not repeat them on every series. No user, session, request, resource, URL, query-string,
filename, exception-message, or SQL-text value is used as a metric label.

## Business counter semantics

Metrics are operational signals, not an audit log or source of truth. Scenario creation,
successful playthrough start, completion, abandonment, generated analysis, and living draft
counters increment only after the corresponding transaction commits. A cached analysis is
not a new business event. Notification `sent` records provider acceptance, not inbox delivery.
The living `no_change` event has no write to commit; it records a successful model evaluation
that decided the story had not materially moved.

## Process, replica, and restart behavior

Production currently starts one uvicorn worker in each container. Metrics are in that
process's memory and therefore match this process model. Counters reset when the container
restarts; use `rate()` or `increase()` rather than subtracting raw samples. If the Deployment
is scaled horizontally, vmagent must discover and scrape every pod, and dashboards should
sum across pods. Do not configure multiple uvicorn workers behind one scraped port without
first configuring the Prometheus client's multiprocess mode.

The scheduled living update is a short-lived Kubernetes CronJob. Its in-memory metrics exit
with that process and normally cannot be scraped. The `background_job_*` series are durable
only when a pass is invoked through `/api/admin/living/run` in the long-lived API process.
For the scheduled CronJob, alert on Kubernetes Job/CronJob status from kube-state-metrics (or
logs), not these application counters. A Pushgateway is intentionally not introduced.

## PromQL

Examples assume vmagent attaches `service="game-theory-sim"` and `environment`. Replace
`$environment` with the Grafana variable or concrete environment.

Request rate:

```promql
sum(rate(http_server_requests_total{service="game-theory-sim",environment=~"$environment"}[5m]))
```

HTTP 5xx ratio:

```promql
sum(rate(http_server_requests_total{service="game-theory-sim",environment=~"$environment",status_code=~"5.."}[5m]))
/
clamp_min(sum(rate(http_server_requests_total{service="game-theory-sim",environment=~"$environment"}[5m])), 0.001)
```

p95 latency:

```promql
histogram_quantile(0.95,
  sum by (le) (rate(http_server_request_duration_seconds_bucket{service="game-theory-sim",environment=~"$environment"}[5m]))
)
```

Dependency error rate by dependency:

```promql
sum by (dependency) (rate(dependency_requests_total{service="game-theory-sim",environment=~"$environment",outcome=~"error|invalid"}[10m]))
/
clamp_min(sum by (dependency) (rate(dependency_requests_total{service="game-theory-sim",environment=~"$environment"}[10m])), 0.001)
```

Background job failure rate (long-lived admin-triggered runs only):

```promql
sum(rate(background_jobs_total{service="game-theory-sim",environment=~"$environment",outcome=~"failure|partial_failure"}[24h]))
/
clamp_min(sum(rate(background_jobs_total{service="game-theory-sim",environment=~"$environment"}[24h])), 0.000001)
```

Business KPIs:

```promql
# Scenarios created per hour
sum(increase(scenarios_created_total{service="game-theory-sim",environment=~"$environment"}[1h]))

# Successful playthrough starts per hour
sum(increase(playthroughs_started_total{service="game-theory-sim",environment=~"$environment",outcome="success"}[1h]))

# Playthrough start failure ratio
sum(rate(playthroughs_started_total{service="game-theory-sim",environment=~"$environment",outcome!="success"}[1h]))
/
clamp_min(sum(rate(playthroughs_started_total{service="game-theory-sim",environment=~"$environment"}[1h])), 0.000001)

# Completed and abandoned playthroughs per hour
sum(increase(playthroughs_completed_total{service="game-theory-sim",environment=~"$environment"}[1h]))
sum(increase(playthroughs_abandoned_total{service="game-theory-sim",environment=~"$environment"}[1h]))

# New analyses by type per hour
sum by (analysis_type) (increase(analyses_generated_total{service="game-theory-sim",environment=~"$environment"}[1h]))

# Living-scenario evaluations by outcome over 24 hours
sum by (outcome) (increase(living_scenario_updates_total{service="game-theory-sim",environment=~"$environment"}[24h]))

# Transactional email attempts by outcome per hour
sum by (outcome) (increase(notifications_sent_total{service="game-theory-sim",environment=~"$environment",channel="email"}[1h]))
```

Useful supporting queries:

```promql
# DeepSeek p95 by operation
histogram_quantile(0.95,
  sum by (le, operation) (rate(dependency_request_duration_seconds_bucket{service="game-theory-sim",dependency="deepseek"}[10m]))
)

# LLM response-cache hit ratio
sum(rate(cache_requests_total{service="game-theory-sim",cache="llm_response",result="hit"}[10m]))
/
clamp_min(sum(rate(cache_requests_total{service="game-theory-sim",cache="llm_response"}[10m])), 0.001)

# PostgreSQL p95 statement latency by operation
histogram_quantile(0.95,
  sum by (le, operation) (rate(database_query_duration_seconds_bucket{service="game-theory-sim"}[10m]))
)
```

## Recommended Grafana panels

- Stat panels for request rate, 5xx ratio, global p95, active target count, successful
  playthrough starts, completions, and scenario creations.
- A time series split by normalized `route` and `status_code` for request rate and errors.
- A p50/p95/p99 HTTP latency time series, plus a heatmap from the HTTP histogram.
- Dependency request rate, error ratio, and p95 latency split by `dependency` and `operation`.
- PostgreSQL p95 latency by operation and LLM cache hit ratio.
- Business time series for starts versus completions/abandonments, analyses by type, living
  outcomes, and email outcomes.
- Standard Python/process CPU, resident memory, open file descriptors, and GC panels when
  those default collectors are available on the target platform.

## Recommended alerts

The central alert rules should include `service="game-theory-sim"` and the intended
production `environment`. Tune thresholds after collecting a baseline.

Warning HTTP 5xx ratio (over 2% for 10 minutes, with traffic):

```promql
(
  sum(rate(http_server_requests_total{service="game-theory-sim",status_code=~"5.."}[10m]))
  / clamp_min(sum(rate(http_server_requests_total{service="game-theory-sim"}[10m])), 0.001)
) > 0.02
and sum(rate(http_server_requests_total{service="game-theory-sim"}[10m])) > 0.05
```

Critical HTTP 5xx ratio: use the same expression at `> 0.05` for 5 minutes. Warning p95
latency: global p95 `> 5` seconds for 15 minutes; critical: `> 15` seconds for 10 minutes.
Use the p95 query above as the left side of the comparison.

Warning dependency error ratio (over 5% by dependency for 15 minutes):

```promql
(
  sum by (dependency) (rate(dependency_requests_total{service="game-theory-sim",outcome=~"error|invalid"}[15m]))
  / clamp_min(sum by (dependency) (rate(dependency_requests_total{service="game-theory-sim"}[15m])), 0.001)
) > 0.05
```

Critical dependency errors: use `> 0.20` for 10 minutes. Alert warning if any long-lived
admin-triggered living job fails or partially fails:

```promql
increase(background_jobs_total{service="game-theory-sim",job="living_scenario_update",outcome=~"failure|partial_failure"}[25h]) > 0
```

Also configure warning/critical target-down alerts from `up{service="game-theory-sim"} == 0`
for 5/15 minutes, a critical Kubernetes CronJob failed/deadline alert for
`game-theory-sim-living`, and a warning if no successful scheduled Job has completed in 26
hours. Business KPI changes are best dashboard annotations or baseline/anomaly alerts rather
than fixed paging thresholds until normal traffic is established.

## Kubernetes and homelab handoff

There is no application Service or Ingress manifest in this repository. The only reference
manifest here is `deploy/living-cronjob.yaml`; the live deployment is owned by the homelab
repository. Update the homelab Service metadata and port to include:

```yaml
metadata:
  labels:
    app.kubernetes.io/name: game-theory-sim
    app.kubernetes.io/version: "0.1.0" # keep aligned with the deployed image/release
    observability.link108.dev/scrape: "true"
spec:
  ports:
    - name: http
      port: 8000       # preserve the current Service port if it differs
      targetPort: 8000
      protocol: TCP
```

Apply `app.kubernetes.io/name` and `app.kubernetes.io/version` consistently to the
Deployment pod template if the central discovery contract expects pod labels. Configure
vmagent discovery to select `observability.link108.dev/scrape="true"`, scrape the named
`http` port at `/metrics`, and attach the central `service`, `environment`, and `version`
target labels. Keep `/metrics` off the public Ingress (or deny that path at the ingress
layer); only `/api` and SPA traffic need public routing.
