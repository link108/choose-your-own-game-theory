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
- **Information hiding is structural**: play endpoints only serialize `player_view`;
  `gm_state` is exposed only by the review endpoint, after the fact.
- **Every LLM call is cached** in the `llm_calls` table (keyed by prompt hash), so replays
  are free and every generation is auditable. "Regenerate" bumps a nonce to force a fresh
  variation.
- **Identity** is an anonymous session cookie for now; real accounts can hang off the
  `anon_sessions` table later.

## Development

Requirements: [uv](https://docs.astral.sh/uv/), node 22+, docker, [just](https://github.com/casey/just).

```sh
cp .env.example .env        # add your DEEPSEEK_API_KEY
just install                # backend + frontend deps
just db-up                  # postgres via docker compose
just migrate                # apply migrations
just seed                   # optional: two sample scenarios
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
`DATABASE_URL` (note the `postgresql+asyncpg://` scheme) and `DEEPSEEK_API_KEY`.
Woodpecker CI builds/pushes the image on push to main and opens a deploy PR against the
homelab repo (see `.woodpecker/build.yaml`).

## Layout

```
backend/
  app/
    main.py          FastAPI app + SPA static serving
    models.py        SQLAlchemy models (scenarios, playthroughs, turns, llm_calls)
    schemas.py       API schemas + validated LLM output schemas
    routers/         scenarios (CRUD + AI draft), playthroughs (play/review)
    services/
      llm.py         DeepSeek client: cache -> JSON mode -> validate -> retry
      engine.py      turn engine (start, resolve choice, regenerate)
      builder.py     concept -> scenario draft
    prompts/         GM + builder prompt templates
  alembic/           migrations
  tests/             pytest (stubbed LLM)
frontend/            Vite + React SPA
```
