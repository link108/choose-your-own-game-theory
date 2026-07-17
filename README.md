# Scenario Sim

Create a scenario — an engineering-management dilemma, a D&D one-shot, a tough customer
call — then play it as a choose-your-own-adventure. An LLM game master presents 3–5
options each turn, plays every NPC (with hidden agendas), and keeps full hidden state you
only get to see in the post-game review.

Built with FastAPI + PostgreSQL + a Vite/React SPA, using DeepSeek as the LLM.

## How it works

- **Scenarios** are a handful of mostly-freeform fields (premise, setting, tone, goal,
  playable roles with private info, NPCs with hidden agendas, GM notes). The LLM interprets
  them, which is what makes one schema work for any domain. The builder page can draft all
  fields from a one-sentence concept.
- **Playthroughs** advance turn by turn. Each turn the LLM produces a strictly validated
  JSON object: player-visible narrative + 3–5 options, plus a full hidden `gm_state`
  (every actor's status/intent/private reasoning, hidden facts, goal progress) that seeds
  the next turn. Invalid output is retried with the validation errors fed back.
- **Context-enabled scenarios** run a structured intake before play, ask focused follow-up
  questions, freeze the resulting context on the playthrough, and include its summary in
  every turn and analysis. High-risk scenarios carry additional guardrails and disclosures.
- **Information hiding is structural**: play endpoints only serialize `player_view`;
  `gm_state` is exposed only by the review endpoint, after the fact.
- **Post-game analysis**: once a playthrough ends, the review page can generate a coaching
  report — which decisions mattered, what the hidden state meant for them, and what to try
  next time. Generated once on demand and stored on the playthrough.
- **Every LLM call is cached** in the `llm_calls` table (keyed by prompt hash), so replays
  are free and every generation is auditable. "Regenerate" bumps a nonce to force a fresh
  variation.
- **Identity**: accounts are optional. Browser guests get an anonymous session cookie;
  native-app guests call `POST /api/auth/guest` for a bearer token wrapping a fresh
  session — either way, possession of the credential is the whole identity. Registering
  (email/password, `/api/auth/*`) claims the caller's current session — everything made
  as a guest transfers to the account — and issues a 30-day bearer JWT. Every user
  permanently owns one `anon_sessions` row, so ownership FKs never change and content
  follows the user across devices. Roles are `user`/`admin`; the `ADMIN_EMAIL` account
  is promoted to admin on register/login and sees the `/admin` living-scenarios UI.
- **The scenario library** is a set of seeded scenarios (flagged `is_library`, grouped by
  `category`) that every session can browse and play but not edit. The pipeline:
  `app/seed_catalog.py` holds curated one-line concepts; `just seed-generate` expands them
  into full scenarios via the AI builder and writes JSON fixtures to `app/seed_data/`;
  fixtures get reviewed/edited, committed, and loaded idempotently by `just seed` (matched
  by title — re-seeding updates existing rows, so fixture edits propagate).
- **Living scenarios** (flagged `is_living`) track a real-world news story. A daily pass
  (`just living-run`, or the k8s CronJob in `deploy/living-cronjob.yaml`) pulls headlines
  from a politically balanced set of RSS feeds (left/center/right/international, see
  `services/living.py`), asks the LLM whether the story moved, and drafts a revised
  scenario plus a situation-log entry citing its sources. Drafts apply nothing until
  approved in the admin UI at `/admin` (gated by `ADMIN_TOKEN`); approval updates the
  scenario and publishes the log entry, which players see as a "Situation log" timeline
  (admin = a signed-in user with the admin role).
  Playthroughs snapshot scenario content at start, so an update never shifts a game in
  progress; re-seeding leaves living scenarios untouched (the fixture is only their
  starting point).

## Development

Requirements: [uv](https://docs.astral.sh/uv/), node 22+, docker, [just](https://github.com/casey/just).

```sh
cp .env.example .env        # add your DEEPSEEK_API_KEY
just install                # backend + frontend deps
just db-up                  # postgres via docker compose
just migrate                # apply migrations
just seed                   # optional: seed the scenario library from committed fixtures
just seed --category health-conversations  # seed only the health-practice scenarios
just api                    # uvicorn on :8000
just web                    # vite on :5173 (proxies /api)
```

Open http://localhost:5173.

```sh
just test                   # backend tests (sqlite, stubbed LLM — no key needed)
just lint                   # ruff + tsc
just migration "message"    # autogenerate a migration after model changes
```

## Deployment

A single container serves the API and the built SPA:

```sh
just docker-build           # -> link108/game-theory-sim:latest
```

The container runs `alembic upgrade head` on start, then uvicorn on :8000. It needs
`DATABASE_URL` (note the `postgresql+asyncpg://` scheme) and `DEEPSEEK_API_KEY`, plus
`JWT_SECRET` (enables register/login) and `ADMIN_EMAIL` (that account becomes the admin
for the `/admin` living-scenarios UI); the daily news pass is a CronJob reusing the same
image (`deploy/living-cronjob.yaml`, copy into the homelab repo).
Woodpecker CI builds/pushes the image on push to main and opens a deploy PR against the
homelab repo (see `.woodpecker/build.yaml`).

Seed fixtures are included in the image, but local database rows are not copied to the VPS.
After deploying the new image, seed the health scenarios against the VPS database with one of:

```sh
# Docker
docker exec <container> uv run --no-sync python -m app.seed --category health-conversations

# Kubernetes
kubectl exec deployment/<deployment> -- \
  uv run --no-sync python -m app.seed --category health-conversations
```

Seeding is idempotent by scenario title, so the command can be rerun after fixture updates.

## Layout

```
backend/
  app/
    main.py          FastAPI app + SPA static serving
    models.py        SQLAlchemy models (scenarios, playthroughs, turns, llm_calls)
    schemas.py       API schemas + validated LLM output schemas
    routers/         auth (register/login/me), scenarios (CRUD + AI draft),
                     playthroughs (play/review), admin (living-scenario review)
    services/
      llm.py         DeepSeek client: cache -> JSON mode -> validate -> retry
      auth.py        bcrypt password hashing + bearer JWTs
      engine.py      turn engine (start, resolve choice, regenerate)
      builder.py     concept -> scenario draft
      living.py      living scenarios: RSS feeds -> LLM -> draft updates
    prompts/         GM + builder + living-update prompt templates
  alembic/           migrations
  tests/             pytest (stubbed LLM)
frontend/            Vite + React SPA
```
