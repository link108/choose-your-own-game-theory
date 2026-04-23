# Scenario DSL Remaining Work

This note captures the remaining work after the current Scenario Package / DSL migration slices.

## Current State

Implemented:

- `scenarioPackage` persisted on `Scenario`
- DSL schema, validation, state snapshotting, effect expansion, operation resolver
- package-backed turn resolution path
- package-aware choice generation, regeneration, suggested action flow
- structured choice execution metadata
- debug surfacing for choices and selected-choice execution
- Package tab in scenario editor
- Package tab authoring for:
  - `choicePolicy`
  - `actorCapabilities`
  - `triggerRules`
  - `stateExtensions.objectTypes`
  - `stateExtensions.objects`

Still true:

- legacy proposal / semantic / fallback runtime paths still exist
- package authoring is possible, but still manual and partly JSON-driven
- narrative grounding is improved indirectly, but not fully locked to committed facts

## Remaining Work

### 1. Package Draft Generation From Prompt

Goal:

- let authors describe a scenario in natural language and get a draft `scenarioPackage`

Needed work:

- add a builder entry point in the scenario editor Package tab
- create backend/API flow for:
  - draft package generation
  - validation
  - critique / refinement
- keep output as draft only; do not auto-apply without user action
- reuse the existing package validation as the final gate

Success criteria:

- user can provide a prompt and receive a valid or near-valid draft package
- validation issues are shown inline before saving

### 2. Narrative Grounding Cleanup

Goal:

- ensure page narrative only describes committed state changes, validated actor actions, and visible state

Needed work:

- tighten narration input so it is based on resolved turn facts, not loose inference
- ensure titles are derived from committed events / state changes
- reduce drift between narrative, world state, and scenario objects

Success criteria:

- no page claims a state change that does not exist in canonical state

### 3. Package Editing Ergonomics

Goal:

- reduce raw JSON editing for common authoring tasks

Needed work:

- typed field editor for object type fields
- typed editor for trigger operations
- typed editor for object field values when the object type is known
- safer effect-definition editing UI

Success criteria:

- authors can edit common package sections without hand-writing JSON for basic cases

### 4. Choice Grounding / Validation Hardening

Goal:

- improve the quality and executability of displayed choices

Needed work:

- stronger no-op detection
- stronger semantic deduplication
- clearer handling of rejected suggested actions
- more direct mapping between choice display and executable scenario effects

Success criteria:

- fewer vague or redundant choices
- clearer debug trail when a suggested action is rejected or downgraded

### 5. Migration / Legacy Path Cleanup

Goal:

- make the package-backed path the default architecture rather than an optional branch

Needed work:

- define migration policy for scenarios without `scenarioPackage`
- track fallback usage explicitly
- eventually remove dead legacy branches after confidence is high

Success criteria:

- clear runtime policy for package vs legacy scenarios
- reduced maintenance burden from duplicate resolution paths

### 6. Observability / Debug Trace

Tracked separately in:

- `docs/notes/observability.md`

Goal:

- structured internal execution trace first
- Langfuse export later

## Recommended Next Step

Highest-value next slice:

1. Package draft generation from prompt

Reason:

- the runtime and editor foundation now exist
- the biggest remaining gap is helping authors create valid packages efficiently

## Verification Baseline

Before and after future slices, run:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`

Current known lint state:

- 7 pre-existing warnings, no errors
