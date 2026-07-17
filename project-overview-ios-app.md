# Project Overview: iOS App and Subscription Platform

Status: proposal for review. No implementation has started.

This document maps the iOS + subscription product spec onto the existing codebase
(FastAPI + Postgres backend, Vite/React SPA, DeepSeek LLM, k3s deploy via Woodpecker).

---

## 1. Current codebase findings

### What exists and is directly reusable

- **Backend owns everything canonical already.** All LLM orchestration, turn
  resolution, validation/retry, and scenario logic live server-side
  (`services/llm.py`, `services/engine.py`, `services/builder.py`). The web SPA is
  a thin client over `/api`. This is exactly the shared-backend architecture the
  spec requires — no client ever needs simulation logic.
- **Auth is already native-app ready in its core design.** Identity is
  cookie-free-capable: `POST /api/auth/guest` mints a bearer token wrapping a fresh
  `anon_sessions` row specifically for native apps ("possession of the credential is
  the whole identity"). Registering while sending a guest token claims that session,
  so everything made as a guest transfers to the account. Email/password login
  issues a 30-day bearer JWT. Roles are `user`/`admin` (`ADMIN_EMAIL` promotion).
- **Ownership model.** Every user permanently owns one `anon_sessions` row;
  scenarios and playthroughs FK to `owner_session_id`. Content follows the user
  across devices with no FK rewrites. This survives the iOS app unchanged.
- **Gameplay engine.** Playthroughs snapshot scenario content at start
  (`scenario_snapshot`), turns store `player_view` (safe) and `gm_state` (hidden
  until review) as separate columns — information hiding is structural. Endpoints:
  start, get, choose, suggest-action (player free-text validated into an option),
  regenerate, abandon, analysis, review, cross-run insights, stats.
  Choice resolution is idempotent (retrying the same option hits the LLM cache) —
  good for flaky mobile networks.
- **LLM caching.** Every call cached in `llm_calls` keyed by prompt hash; replays
  are free, generations auditable, "regenerate" bumps a nonce.
- **Library catalog.** `is_library` scenarios grouped by free-form `category`,
  readable/playable by all sessions, seeded from committed fixtures idempotently.
- **Living scenarios.** Full pipeline: daily RSS pass → LLM drafts → admin review at
  `/admin` → published situation-log entries with source attribution
  (`GET /api/scenarios/{id}/updates`, `ScenarioUpdate` model with outlet/lean/url
  sources). Playthrough snapshots mean updates never shift games in progress.
- **Context intake.** Context-enabled scenarios run a structured pre-play intake
  with follow-up questions and risk domains — must be supported in the iOS play flow.
- **Email.** Resend-backed verify/reset/welcome flows, live in prod.

### What does not exist (the real work)

| Spec requirement | Current state |
|---|---|
| Conversational scenario-creation agent (sessions, option cards, stages, validation, accept) | **Absent.** Creation is a one-shot `POST /api/scenarios/draft` (concept → full draft) plus a form editor on web. This is the largest new backend build. |
| Subscriptions, entitlements, usage limits | **Absent.** No Stripe, no IAP, no premium flags, no limits anywhere. |
| Branching / branch comparison | **Absent.** Turns are strictly linear per playthrough (unique `(playthrough_id, index)`). |
| Token refresh, logout/revocation, account deletion | **Absent.** Single 30-day JWT; logout is client-side token drop; no delete-account endpoint (App Store blocker). |
| Sign in with Apple | Absent (email/password only). |
| Featured/recommended/free-rotation catalog concepts | Absent (only `category` + `is_library` + `is_living`). |
| Follow a live scenario / push notifications | Absent. |
| Typed API contract consumed by clients | FastAPI auto-serves `/openapi.json`, but `frontend/src/api.ts` is hand-written and nothing is generated from the spec. |

---

## 2. Existing APIs that can be reused as-is (or nearly)

All under `/api`, all accept bearer tokens today:

- **Auth:** `POST /auth/guest`, `/auth/register`, `/auth/login`, `GET /auth/me`,
  password reset + email verification endpoints.
- **Catalog:** `GET /scenarios/library` (all library scenarios with category),
  `GET /scenarios/{id}`, `GET /scenarios/{id}/updates` (situation log).
- **Custom scenarios:** `GET/POST /scenarios`, `PUT/DELETE /scenarios/{id}`,
  `POST /scenarios/draft` (keep as the "quick draft" path inside the new agent).
- **Gameplay:** `POST /scenarios/{id}/playthroughs`, `GET /playthroughs/{id}`,
  `POST /playthroughs/{id}/choice`, `/suggest-action`, `/regenerate`, `/abandon`,
  `/analysis`, `GET /playthroughs/{id}/review`,
  `POST /scenarios/{id}/context-intake`, `GET /scenarios/{id}/playthroughs`.
- **Stats:** user stats + per-scenario insights.
- **Admin:** living-update review (stays web-only).

The turn payload (`TurnOut.player_view`: narrative, visible_state_summary,
options with reasoning, epilogue) maps 1:1 onto the spec's Turn Page model.

## 3. Missing APIs to add

- **Auth:** `POST /auth/refresh`, `POST /auth/logout` (revoke), `POST /auth/apple`
  (Sign in with Apple), `DELETE /auth/me` (account deletion).
- **Authoring sessions:** `POST /authoring-sessions`, `GET /authoring-sessions/{id}`,
  `POST /authoring-sessions/{id}/events` (message / select / reject /
  request-alternatives / regenerate-section / undo / validate / accept),
  `GET /authoring-sessions` (list drafts in progress).
- **Entitlements:** `GET /me/entitlements` (capabilities + usage),
  `POST /iap/app-store/sync` (client-verified transaction JWS),
  `POST /iap/app-store/notifications` (App Store Server Notifications V2 webhook).
- **Catalog:** `GET /catalog` (featured, live, free-rotation, categories in one
  response), lightweight `GET /scenarios/library?filter=` params.
- **Library/follows:** `POST/DELETE /scenarios/{id}/follow`, `GET /me/follows`,
  `GET /me/playthroughs` (cross-scenario saved-sessions list — today listing is
  per-scenario only).
- **Branching:** `POST /playthroughs/{id}/branch` (fork at turn index),
  `GET /playthroughs/{id}/branches`, `GET /playthroughs/compare?a=&b=`.
- **Push:** `POST /me/devices` (APNs token registration), notification prefs.

## 4. Authentication recommendation

Keep the existing model — it was designed for this — and harden it:

1. **Keep** guest bearer tokens (`/auth/guest`) as the iOS first-launch identity.
   Users can browse and play before creating an account; registering claims their
   content. This is also App-Review-friendly (try before sign-up).
2. **Add refresh tokens.** Replace the single 30-day JWT with a short-lived access
   JWT (~1h) + opaque refresh token stored server-side (new `refresh_tokens` table:
   hashed token, user, device label, expiry, revoked flag). Enables logout,
   device revocation, and password-reset-revokes-sessions. Web can migrate to the
   same flow with a compatibility window for existing 30-day JWTs.
3. **Add Sign in with Apple.** Verify Apple's identity token server-side, link by
   email or by stored `apple_sub`, reuse the session-claiming flow. Not strictly
   mandated while we only offer our own email/password (Guideline 4.8 triggers on
   third-party logins), but it materially improves iOS conversion and future-proofs
   adding Google.
4. **Add `DELETE /auth/me`** — App Store requires in-app account deletion. Delete
   user row + owned scenarios/playthroughs (or anonymize), revoke tokens.
5. iOS stores tokens in **Keychain** only.

## 5. Shared API contract strategy

- One `/api` surface for both clients — no `/mobile` namespace.
- Add `operation_id`s and response models to every route (mostly done), then treat
  FastAPI's `/openapi.json` as the contract artifact: commit a snapshot
  (`just openapi` → `openapi.json`), CI-check it against the running app.
- Generate clients: **swift-openapi-generator** (Apple's) for iOS,
  **openapi-typescript** for web (retiring the hand-written `api.ts` gradually).
- Version by additive evolution; breaking changes gated behind new endpoints.
  Entitlement capabilities are returned as a typed object so old clients ignore
  new capabilities safely.

## 6. iOS architecture

- **SwiftUI + Swift 6 concurrency**, iOS 17+ (`@Observable` view models).
- Modular SPM packages in `ios/` inside this repo:
  - `APIClient` — generated from OpenAPI + thin auth wrapper (token refresh,
    guest bootstrap, Keychain).
  - `Models` — generated DTOs + small view-layer mappers.
  - `Features/…` — Catalog, Play, Create, Library, Account, Paywall.
  - `Persistence` — lightweight cache (SwiftData or file cache of last-fetched
    catalog/scenario/turn JSON) for offline display.
- MVVM: one `@Observable` store per screen; server is the source of truth;
  optimistic UI only where idempotency protects us (e.g. choice submission —
  the backend tolerates retries of the same option).
- StoreKit 2 in an `Entitlements` service: listens for `Transaction.updates`,
  posts JWS to backend, refreshes `/me/entitlements`.

## 7. SwiftUI navigation and views

Tab bar: **Home · Explore · Create · Library · Account** (as specced).

- **Home:** "Continue playing" (active playthroughs w/ turn count), featured,
  recently updated live scenarios (from situation-log timestamps), recent custom
  scenarios.
- **Explore:** category chips (existing free-form categories normalized), plus
  Live / Free / Premium filters; scenario detail shows premise, roles to pick,
  situation log for living scenarios (baseline date, last update, sources), and
  the "Explore plausible outcomes from a dated scenario baseline" framing.
- **Create:** conversational builder (below).
- **Library:** saved playthroughs (resume), my scenarios, completed runs (review +
  analysis + insights), branches, followed live scenarios.
- **Account:** profile, verification nudge, subscription status/manage/restore,
  usage vs. limits, notifications, delete account, sign out. Guest users see
  "Create account to sync across devices" instead.

## 8. Conversational creation UI design

Server drives everything; the client renders typed content blocks.

- Backend authoring session returns a transcript of typed blocks:
  `assistant_text`, `question`, `option_group{ single|multi, options[] }`,
  `draft_update` (current `ScenarioDraft` fields), `validation_summary`,
  `review_request`.
- Client sends typed events: `message`, `select{option_ids}`, `reject`,
  `request_alternatives`, `regenerate_section{field}`, `undo`, `validate`,
  `accept`.
- **Undo (decided):** every LLM `draft_update` stores a full immutable snapshot of
  the draft (drafts are small — a handful of text fields plus roles/npcs), and the
  session tracks a current-revision pointer. `undo` moves the pointer back one
  LLM edit; the transcript keeps all revisions, so redo and "compare with
  previous" fall out for free. When AI-assisted editing of *accepted* scenarios
  is added later (advanced editor / agent), the same mechanism extends via a
  `scenario_revisions` table: each LLM edit writes the prior content as a
  revision, and undo restores it.
- iPhone: chat is the primary surface; a "Draft" bar shows progress
  (fields filled / issues) and opens a sheet with the scenario preview and
  per-section regenerate. Accept flow = full-screen review → confirm →
  `accept` event → backend creates the canonical scenario via existing
  `Scenario` creation path.
- iPad: `NavigationSplitView` — conversation left, live draft preview right.
- The existing one-shot `builder.draft_scenario` becomes a tool the agent calls
  for its first proposal, so prompt work is reused, not duplicated.
- Web's `ScenarioBuilder` page later consumes the same session API (nice-to-have;
  the current form remains the "advanced editor").

## 9. Gameplay UI design

- Turn page = narrative (scrollable, Dynamic Type), visible-state summary card,
  option cards with player-safe `reasoning`, "suggest your own action" composer
  (existing `/suggest-action`), regenerate button where allowed.
- On choose: disable options, submit, streaming-style progress indicator
  (resolution takes seconds — set expectations), animate in the new turn,
  auto-saved by design (server persists every turn).
- Context-enabled scenarios: intake flow (initial context → follow-up questions →
  summary confirmation, surfacing `urgent_warning` and disclaimers) before start.
- Completed runs: epilogue, then review screen revealing `gm_state` per turn
  (hidden agendas, actor reasoning) and the coaching analysis — this is the
  product's signature moment; give it a real reveal treatment.
- Accessibility: VoiceOver labels on option cards, reduced-motion variants,
  contrast-checked palette, Dynamic Type throughout.

## 10. StoreKit and entitlement architecture

**iOS:** one subscription group, `premium.monthly` / `premium.annual` (intro
offers later). Load products via StoreKit 2, display Apple's localized pricing
(never hardcode $4.99/$39.99 in copy), purchase with
`appAccountToken = user/session UUID` so transactions map to identities even for
guests, observe `Transaction.updates`, send the signed transaction (JWS) to
`POST /iap/app-store/sync`, restore via `AppStore.sync()`.

**Backend:**
- Verify JWS signatures (Apple root certs) and/or confirm via the App Store
  Server API; consume **App Store Server Notifications V2** at
  `/iap/app-store/notifications` for renewals, expiration, billing retry, grace
  period, refunds, revocation.
- Tables: `subscriptions` (user/session, provider `app_store|stripe|comp`,
  product id, original_transaction_id unique, status, current_period_end,
  environment) + `iap_events` audit log.
- **Entitlements are computed server-side** from active subscriptions + a
  `plan_config` row (admin-editable JSON, seeded with the free/premium limits) and
  returned as the capabilities object from the spec
  (`canAccessLiveScenarios`, `customScenarioLimit`, `savedSessionLimit`,
  `branchLimit`, `canCompareBranches`, `allowedModelTier`, …). Limits live in
  config, not code, not the app.
- **Enforcement** via FastAPI dependencies at the mutating endpoints:
  scenario create checks `customScenarioLimit`, playthrough start checks
  `savedSessionLimit` + premium/live scenario access, branch create checks
  `branchLimit`. Client-side entitlements shape UI only.
- Web premium later via Stripe Checkout (never inside the iOS app), writing into
  the same `subscriptions` table — one entitlement model, two providers.

## 11. Required backend changes (summary)

1. Refresh tokens + logout + Sign in with Apple + account deletion (§4).
2. Authoring-session agent: models, event loop service, prompts (new
   `prompts/authoring.py`), reusing `llm.generate` with strict Pydantic output
   schemas for each block type.
3. Entitlements: models, plan config, capability computation, enforcement deps,
   App Store verification + notifications, Stripe later.
4. Catalog metadata: `is_premium`, `featured_rank`, free-rotation mechanism
   (config list of scenario ids or a flag), baseline-date on living scenarios.
5. Branching (confirmed low-risk): `parent_playthrough_id` + `branched_at_index`
   on playthroughs; fork copies turns ≤ index (cheap — rows only, no LLM calls),
   clearing `chosen_option_id` on the fork-point turn so a different option can
   be chosen there (the engine only ever reads `latest_turn` + its `gm_state`,
   so forked runs need no engine changes); compare endpoint returns both
   choice-paths + outcomes (reuse `_run_record`).
6. Follows + APNs device registry + a small push sender (living-update approval
   triggers "followed scenario updated").
7. OpenAPI hygiene: operation ids, committed spec snapshot, CI check.

## 12. Data model changes

New tables: `refresh_tokens`, `authoring_sessions`, `authoring_events` (typed
transcript; `draft_update` events carry a full draft snapshot to power undo),
`subscriptions`, `iap_events`, `plan_config`, `scenario_follows`, `devices`,
and later `scenario_revisions` (undo for LLM edits to accepted scenarios). New columns: `users.apple_sub`,
`scenarios.is_premium/featured_rank`, living baseline date,
`playthroughs.parent_playthrough_id/branched_at_index`. All additive Alembic
migrations; nothing existing changes shape. Guest→premium edge: subscriptions may
attach to a `session_id` before an account exists (appAccountToken), and get
claimed on register exactly like content does.

## 13. Testing strategy

- **Backend:** extend the existing pytest suite (sqlite + stubbed LLM — already
  fast and key-free): authoring-session event loop, entitlement enforcement
  matrix (free vs premium vs guest per endpoint), signed-JWS fixtures for IAP
  sync, notification webhook replay tests, branch fork/compare.
- **Contract:** CI diff of `/openapi.json` snapshot; generated-client compile
  check on both platforms.
- **iOS:** unit tests on view models with a mocked generated client; StoreKitTest
  (`.storekit` config) for purchase/restore/renewal paths without the sandbox;
  snapshot tests for turn page + option cards; a small UI-test happy path
  (browse → play → choose → resume).
- **E2E sandbox:** TestFlight build against a staging backend with App Store
  sandbox notifications wired up before enabling the paywall (per rollout plan).

## 14. App Store readiness

- In-app account deletion (§4) — hard requirement.
- Privacy policy + terms URLs, App Privacy nutrition labels (account data,
  purchases, analytics-lite; no narrative/chat content leaves the product).
- Subscription disclosures, restore purchases, manage-subscription link.
- Review notes + demo account; guest mode helps reviewers.
- Content: user-generated scenarios are private (no sharing yet → no moderation
  UI needed at launch; revisit before any community features).
- Live geopolitical scenarios: label simulated outcomes clearly, show baseline
  date + sources, use the "Explore plausible outcomes from a dated scenario
  baseline" framing. The politically-balanced source mix and human admin review
  already in the living pipeline are strong review-notes material.

## 15. Implementation milestones

**M0 — Backend foundations (unblocks everything):** refresh tokens, account
deletion, Sign in with Apple, OpenAPI snapshot + Swift client generation,
`GET /me/playthroughs`, `GET /catalog`.

**M1 — Phase 1 iOS (core play):** project scaffold, guest bootstrap, auth,
catalog browse, scenario detail (incl. situation log + context intake), full
gameplay loop, resume from Library, error/loading states. *Ship to TestFlight.*

**M2 — Phase 2 (creation):** authoring-session backend + typed blocks (incl.
draft revisions + undo), iOS chat UI, draft preview, validation, accept →
scenario in Library.

**M3 — Phase 3 (monetization):** entitlement backend + plan config + enforcement,
StoreKit products, paywall, purchase/restore/sync, server notifications; enable
only after sandbox E2E passes. (Backend work can start parallel to M1/M2.)

**M4 — Phase 4 (live):** premium gating of live scenarios, follows, APNs push on
published updates, live catalog surfacing.

**M5 — Phase 5 (branching + polish):** branch fork/compare backend + UI, iPad
split views, accessibility audit, offline cache, performance pass.

## 16. Risks and open questions

- **Conversational agent scope** is the biggest unknown — multi-stage agent with
  structured options is a real design project. Mitigation: v1 stages can be
  simple (concept → draft via existing builder → per-field Q&A refinement →
  validate → accept) and deepen later; the typed-block protocol is the contract,
  not the agent's sophistication.
- **Turn latency:** DeepSeek resolution takes seconds; mobile users are less
  patient. Consider streaming narrative tokens later; for now honest progress UI.
- **Free-tier abuse:** guest sessions are free identities — per-session limits
  are trivially resettable. Acceptable at current scale; rate-limit LLM-backed
  endpoints per session/IP and revisit if abused.
- **Existing users:** everything currently live (incl. custom scenarios and
  playthroughs) predates limits. Grandfather existing content: limits apply to
  *new* creations only, never lock people out of their data.
- **Web JWT migration:** 30-day tokens in the wild need a compatibility window
  when refresh tokens land.
- **App Review of political live content** (news-adjacent, Guideline 5.x): the
  human-review pipeline and source attribution are the defense; have review
  notes ready, and be ready to make live scenarios web-only if rejected (small
  blast radius).
- **Decided:** `allowedModelTier` ships in the entitlement object now, with a
  single tier until a second provider/model exists — clients never special-case
  its absence later.
- **Decided:** web keeps its form builder at launch and converges on the shared
  authoring-session API later.
- **Decided:** users can undo LLM edits — draft revisions in authoring sessions
  from day one (§8), `scenario_revisions` when AI edits of accepted scenarios
  arrive.
- **Open:** exact free-rotation mechanics (manual admin list vs. scheduled) —
  recommend a manual `plan_config` list at launch.
