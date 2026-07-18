# CYOA iOS app

Native SwiftUI client for the shared backend (see `project-overview-ios-app.md` at the
repo root). Phase M1: browse the catalog, play scenarios, resume from the library,
manage the account. Creation (M2) and subscriptions (M3) are stubs.

## Status

**This scaffold has not been compiled yet** — it was authored on a machine without
Xcode. Expect to fix small compile errors on first build; the architecture and API
shapes are the deliverable.

## Building

Requires Xcode 15+ (iOS 17 SDK).

```sh
brew install xcodegen
cd ios
xcodegen generate     # produces CYOA.xcodeproj (not committed)
open CYOA.xcodeproj
```

The API base URL defaults to `http://localhost:8000` in Debug (run `just api` at the
repo root) and the production host in Release — see `Sources/AppConfig.swift`.
Simulator + localhost needs no ATS exceptions beyond the local-networking key already
set in `project.yml`.

## Architecture

- `Sources/API/` — Keychain-backed token store and a hand-written typed client
  mirroring the committed `openapi.json`. Hand-written is temporary: once builds run
  through Xcode 15+, switch to swift-openapi-generator against the same contract.
  The client is an actor; it bootstraps a guest bearer token on first launch
  (`POST /api/auth/guest`), attaches `Authorization` everywhere, and on 401 performs a
  single-flight refresh-token rotation and retries once (mirrors `frontend/src/api.ts`).
- `Sources/State/SessionStore.swift` — `@Observable` session state: loading → guest →
  signed in. Registering/signing in upgrades the guest session server-side, so
  everything made while anonymous follows the account.
- `Sources/Views/` — one folder per tab (Home, Explore, Create, Library, Account) plus
  the scenario-detail/play/review flow. Server is the source of truth; screens load in
  `.task` and render `Loadable` states (spinner / error-with-retry / content).

## Conventions

- Tokens live in the Keychain only (`TokenStore`); nothing auth-related touches
  UserDefaults.
- JSON is snake_case on the wire (decoder strategy handles it); dates are ISO 8601
  with fractional seconds (`APIClient.decoder`).
- Choice submission is safe to retry: the backend resolves the same option
  idempotently via its LLM cache.
