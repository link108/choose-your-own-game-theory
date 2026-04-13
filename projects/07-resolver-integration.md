# Project 7: Resolver Integration

## Goal
Wire the simulation resolver (Project 6) into the existing LLM + simulation pipeline. Update LLM prompts to emit semantic effects instead of raw numeric changes. Update turn resolution to run all proposed changes through the resolver before applying them.

## Dependencies
- Project 6 (Simulation Resolver Core) complete
- Project 4 (LLM Integration) complete

---

## Subprojects

### 7.1 Update LLM Output Schema

**Actor Reasoning Prompt** — replace `stateChanges` with `effects`:

Old format (Project 4):
```json
{
  "action": "...",
  "reasoning": "...",
  "stateChanges": [
    { "type": "resource", "target": "ActorName", "field": "gold", "delta": -50, "reason": "..." }
  ]
}
```

New format:
```json
{
  "action": "...",
  "reasoning": "...",
  "effects": [
    { "type": "market_instability", "intensity": "moderate", "target": "ActorName" },
    { "type": "diplomatic_incident", "intensity": "minor" }
  ]
}
```

Update `lib/llm/prompts/actor-reasoning.ts`:
- Remove the `stateChanges` section from the prompt and schema
- Add `effects` section with the `SemanticEffect` schema
- Include the list of valid effect types in the system prompt (pulled from the loaded ruleset)
- Add few-shot examples showing the correct effect format

**Player Choice Effects Prompt** — add a new lightweight prompt (`lib/llm/prompts/choice-effects.ts`):
- Input: player choice text + current state
- Output: `SemanticEffect[]` representing the consequences of the player's choice
- This runs before actor reasoning, so actors can react to the consequences

---

### 7.2 Update Turn Resolution Pipeline

Modify `resolveTurn` in `lib/simulation/engine.ts` to incorporate the resolver:

**New pipeline:**
1. Validate player choice (unchanged)
2. **Run `choice-effects` prompt** → get `SemanticEffect[]` for the player's action
3. For each non-player actor: call actor reasoning prompt → get actor `SemanticEffect[]`
4. Merge all effects into one list (player effects + all actor effects)
5. **Call `resolveEffects(effects, state, ruleset)`** → get `ResolverResult`
6. Log rejected effects and constraints applied
7. **Apply `aggregatedDeltas`** to state (replace old direct-mutation code)
8. Generate events from `ResolverResult` (use effect types + actor actions as event source)
9. Call narration prompt with resolver result context
10. Call choice generation prompt for next turn
11. Persist state + `resolverLog` on Turn record
12. Return `TurnResult`

**Key change in step 7:** State application now reads `ResourceDelta[]` from the resolver rather than applying LLM-proposed numeric changes directly.

```typescript
// Before
applyStateChange(state, { field: 'gold', delta: -50 })

// After
for (const delta of resolverResult.aggregatedDeltas) {
  applyDelta(state, delta)   // delta.finalValue already clamped
}
```

---

### 7.3 Update Narration Prompt

The narration prompt (`lib/llm/prompts/narration.ts`) receives richer context post-resolver:

Add to the narration input:
```typescript
{
  // ... existing fields
  resolverSummary: {
    effectsApplied: string[]    // human-readable list: "military_escalation (moderate)"
    clamped: string[]           // fields that were clamped, for dramatic tension
    rejected: string[]          // effects LLM hallucinated that were rejected
  }
}
```

Update the narration system prompt to reference `clamped` fields naturally:
> "The treasury was strained to its limit" (gold hit min bound)
> "Tensions could not rise higher" (threat hit max cap)

---

### 7.4 Prompt Guardrails

Update all LLM prompts to prevent numeric hallucination:

- **Remove** any instructions that mention numeric deltas, percentages, or raw values
- **Add** to every prompt system message: "You do not control numeric values. Express consequences as effect types and intensities only."
- Include the valid effect type list in each prompt that can produce effects
- Add output validation in `lib/llm/parsing.ts`:
  - If response contains numeric delta fields, strip them and log a warning
  - Validate effect types against the loaded ruleset before passing to resolver

---

### 7.5 Fallback Behavior

When the resolver rejects all effects (e.g. all unknown types from a bad LLM response):
1. Log the full rejection
2. Fall back to a minimal "no change" turn: no deltas applied
3. Narration prompt receives a `fallback: true` flag → generates a "nothing significant happened" narrative
4. Don't surface resolver internals to the player

When a single effect is rejected:
- Continue with the rest; the resolver result already excludes it
- Include the rejection in `resolverLog` for debugging

---

### 7.6 API Response Updates

`POST /api/sessions/[id]/turns` response — add resolver debug info (dev mode only):

```typescript
interface TurnResult {
  // ... existing fields
  resolverDebug?: {           // only included if NODE_ENV === 'development'
    effectsReceived: SemanticEffect[]
    effectsApplied: EffectResolution[]
    effectsRejected: RejectedEffect[]
    constraintsApplied: string[]
  }
}
```

---

### 7.7 UI: Resolver Transparency (Stretch)

Surface resolver decisions in the State Summary Panel (Project 5):

- After turn resolves, show a collapsible "What happened" section in the state panel:
  - List effects applied: "Military escalation (moderate) → threat +15, stability -5"
  - List any clamped fields: "Threat was already near its limit — capped at 100"
- This is optional for MVP but makes the system more debuggable and interesting to players

---

### 7.8 Integration Tests

Tests at `lib/simulation/__tests__/integration/`:

- `resolver-pipeline.test.ts`: full turn with mocked LLM returning semantic effects → assert correct state changes applied
- `rejection.test.ts`: LLM returns unknown effect types → assert rejected, state unchanged, turn still completes
- `clamping.test.ts`: LLM returns effects that would exceed caps → assert clamped values, `resolverLog` records clamping
- `fallback.test.ts`: LLM returns all invalid effects → fallback turn completes without error

---

## Done When
- Actor reasoning and player choice prompts output semantic effects, not numeric deltas
- Turn resolution pipeline runs all effects through the resolver before applying state changes
- Numeric values in game state are only ever set by the resolver (no LLM direct mutations)
- Resolver log is persisted on every Turn record
- Narration reflects clamped/capped fields where appropriate
- All integration tests pass end-to-end with mocked LLM responses
- Dev mode API response includes resolver debug output
