# Project 3: Simulation Engine

## Goal
Build the core turn resolution system — the "truth layer" that takes a player choice, applies rules, validates state changes, and produces structured turn results. This project is LLM-independent; it works with stub/deterministic responses for testing.

## Dependencies
- Project 1 (Foundation) complete
- Project 2 (Scenario Editor) complete (need real scenario data to simulate)

## Subprojects

### 3.1 State Management
- `ScenarioState` type definition — the canonical in-memory representation:
  ```typescript
  interface ScenarioState {
    scenarioId: string
    sessionId: string
    turn: number
    actors: ActorState[]       // current actor states with resources
    relationships: RelationshipState[]
    worldVariables: WorldVariableState[]
    eventHistory: GameEvent[]  // past events for context
  }
  ```
- Functions to:
  - Load state from GameSession (deserialize the JSON snapshot)
  - Save state back to GameSession
  - Clone state (for speculative resolution)
  - Diff two states (for generating "what changed" summaries)

### 3.2 Turn Resolution Pipeline
The core function: `resolveTurn(state, playerChoice) → TurnResult`

Pipeline steps:
1. **Validate player choice** — is this a valid choice from the current page?
2. **Build context** — gather relevant state for LLM (or stub)
3. **Get actor responses** — what do non-player actors do? (stub: deterministic for now)
4. **Propose state changes** — based on player choice + actor responses
5. **Validate state changes** — enforce all rules
6. **Apply changes** — update the state
7. **Generate events** — create event records for what happened
8. **Return TurnResult**

```typescript
interface TurnResult {
  turn: number
  playerChoice: { id: string; text: string }
  stateChanges: StateChange[]
  events: GameEvent[]
  actorResponses: ActorResponseData[]
  newState: ScenarioState
}

interface StateChange {
  type: 'resource' | 'relationship' | 'worldVariable' | 'actorStatus'
  target: string        // actor or variable name
  field: string         // e.g. "gold", "strength"
  oldValue: number | string
  newValue: number | string
  reason: string
}

interface GameEvent {
  id: string
  turn: number
  type: string          // e.g. "negotiation", "conflict", "trade", "discovery"
  description: string
  involvedActors: string[]
}
```

### 3.3 Validation Layer
Rules that MUST be enforced:

**Resource Validation**
- No resource can go below its minValue or above its maxValue
- If a proposed change would violate bounds, clamp to the bound and flag a warning
- Track net resource changes per turn for sanity checking

**Entity Validation**
- Cannot reference actors that don't exist in the scenario
- Cannot create new actors mid-simulation (MVP constraint)
- Cannot interact with actors that have been "eliminated" (if we add that)

**Relationship Validation**
- Relationship strength stays within 0-100
- Relationship type must be from valid set

**World Variable Validation**
- Numeric variables respect min/max bounds
- Type consistency (don't set a number variable to a string)

**Turn Validation**
- Player must select from available choices (can't submit arbitrary actions — MVP)
- One choice per turn

### 3.4 Stub Actor Behavior (Pre-LLM)
Before LLM integration, actors respond deterministically based on traits:
- Aggressive actors: tend toward conflict, demand resources
- Diplomatic actors: tend toward negotiation, offer trades
- Cautious actors: tend to wait, build defenses

This is simple if/else logic — just enough to test the pipeline end-to-end.

### 3.5 State Persistence
- After turn resolution, persist:
  - Updated GameSession.state (the full state snapshot)
  - New Turn record with stateChanges and events
  - ActorResponse records
- Increment GameSession.turn

### 3.6 API Routes
- `POST /api/sessions/[id]/turns` — submit a choice, resolve turn, return result
  - Request: `{ choiceId: string }`
  - Response: `{ turnResult: TurnResult, renderedPage: RenderedPage }`
- `GET /api/sessions/[id]/turns` — list past turns
- `GET /api/sessions/[id]/state` — get current state

## Testing
- Unit tests for validation functions
- Integration test: create scenario → start session → submit choice → verify state changes
- Test that resource bounds are enforced
- Test that invalid choices are rejected

## Done When
- Turn resolution pipeline works end-to-end with stub actors
- Validation catches all rule violations
- State persists correctly across turns
- API routes handle turn submission and return structured results
