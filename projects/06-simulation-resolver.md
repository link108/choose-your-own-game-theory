# Project 6: Simulation Resolver Core

## Goal
Build the deterministic resolver layer that converts LLM-generated semantic effects into validated, bounded numeric state changes. This decouples the LLM from direct numeric manipulation.

## Dependencies
- Project 3 (Simulation Engine) complete
- Project 4 (LLM Integration) complete

## Background
Currently the LLM proposes numeric changes directly (e.g. `threat +7`), which leads to drift and inconsistency. This project introduces a two-stage model:
- **Stage 1 (LLM)**: outputs semantic effects — what happened and at what intensity
- **Stage 2 (Resolver)**: maps effects → numeric deltas via rule config, enforces bounds

---

## Subprojects

### 6.1 Effect Type System

Define the canonical effect schema at `lib/simulation/resolver/types.ts`:

```typescript
type EffectIntensity = 'minor' | 'moderate' | 'major'

interface SemanticEffect {
  type: string           // e.g. "military_escalation", "market_instability"
  intensity: EffectIntensity
  scope?: string         // optional: "local" | "regional" | "global"
  target?: string        // optional: actor name or "world"
}

interface EffectResolution {
  effect: SemanticEffect
  deltas: ResourceDelta[]
  warnings: string[]
  clamped: boolean
}

interface ResourceDelta {
  category: ResourceCategory
  field: string          // e.g. "threat", "gold", "morale"
  actorId?: string       // if actor-scoped
  delta: number
  finalValue: number
  clampedFrom?: number   // if the delta was clamped
  reason: string
}

type ResourceCategory = 'hard' | 'positional' | 'risk'
```

---

### 6.2 Resolver Rule Config

Rules live in `lib/simulation/resolver/rules/` as JSON files (one per effect category, loaded at startup). This makes them tunable without code changes.

**File structure:**
```
lib/simulation/resolver/rules/
  military.json
  economic.json
  diplomatic.json
  social.json
  index.ts        // loads and merges all rule files
```

**Rule format:**
```json
{
  "military_escalation": {
    "minor":    { "threat": 5,  "stability": -2 },
    "moderate": { "threat": 15, "stability": -5 },
    "major":    { "threat": 30, "stability": -10 }
  },
  "supply_disruption": {
    "minor":    { "food": -5,  "fuel": -3 },
    "moderate": { "food": -15, "fuel": -10 },
    "major":    { "food": -30, "fuel": -20 }
  }
}
```

**Initial effect types to implement:**

| Category | Effect Types |
|---|---|
| Military | `military_escalation`, `military_de_escalation`, `border_skirmish`, `ceasefire` |
| Economic | `market_instability`, `trade_boom`, `supply_disruption`, `resource_windfall` |
| Diplomatic | `alliance_formed`, `alliance_fractured`, `diplomatic_incident`, `treaty_signed` |
| Social | `morale_boost`, `morale_collapse`, `legitimacy_crisis`, `public_support_gained` |

---

### 6.3 Resolver Engine

Core resolver function at `lib/simulation/resolver/resolver.ts`:

```typescript
function resolveEffects(
  effects: SemanticEffect[],
  state: ScenarioState,
  ruleset: ResolverRuleset
): ResolverResult

interface ResolverResult {
  resolutions: EffectResolution[]
  aggregatedDeltas: ResourceDelta[]   // merged deltas (stacked effects on same field)
  rejectedEffects: RejectedEffect[]
  appliedConstraints: string[]
  log: string[]
}

interface RejectedEffect {
  effect: SemanticEffect
  reason: string
}
```

**Resolver logic:**
1. For each effect, look up rule in ruleset by `type + intensity`
2. If type is unknown → reject, log warning
3. Map rule deltas → `ResourceDelta[]` referencing real fields in current state
4. Validate field names exist in scenario's variable set
5. Stack deltas from multiple effects on the same field (sum them)
6. Apply per-turn caps (see 6.4)
7. Clamp to field min/max bounds
8. Return full resolution record

---

### 6.4 Constraint System

Per-turn constraints defined in scenario ruleset config (defaults at `lib/simulation/resolver/constraints.ts`):

```typescript
interface ResolverConstraints {
  maxDeltaPerTurn: Record<string, number>   // e.g. { threat: 40, gold: 100 }
  fieldBounds: Record<string, { min: number; max: number }>
  maxEffectsPerTurn: number                 // default: 10
  allowUnknownEffects: boolean              // default: false
}

const DEFAULT_CONSTRAINTS: ResolverConstraints = {
  maxDeltaPerTurn: {
    threat:      40,
    stability:   20,
    morale:      20,
    legitimacy:  15,
    influence:   25,
    gold:        200,
    food:        100,
    fuel:        100,
  },
  fieldBounds: {
    threat:      { min: 0,   max: 100 },
    stability:   { min: 0,   max: 100 },
    morale:      { min: 0,   max: 100 },
    legitimacy:  { min: 0,   max: 100 },
    influence:   { min: 0,   max: 100 },
  },
  maxEffectsPerTurn: 10,
  allowUnknownEffects: false,
}
```

Constraints can be overridden per-scenario via a `resolverConfig` JSON field on the `Scenario` model.

---

### 6.5 Validation Layer

At `lib/simulation/resolver/validation.ts`:

- **Unknown effect**: reject if `type` not in ruleset — log and skip
- **Invalid intensity**: reject if intensity not in `['minor', 'moderate', 'major']`
- **Unknown field**: reject delta if field doesn't exist in current state
- **Per-turn cap**: if aggregated delta on a field exceeds `maxDeltaPerTurn`, clamp to cap and flag `clamped: true`
- **Bounds clamping**: after per-turn cap, clamp `finalValue` to field `[min, max]`
- **Effect count**: if more than `maxEffectsPerTurn`, reject excess with warning

All validations produce log entries (plain strings describing what was applied, clamped, or rejected).

---

### 6.6 Schema Changes

Add `resolverConfig` to `Scenario` and `resolverLog` to `Turn`:

```prisma
model Scenario {
  // ... existing fields
  resolverConfig  Json?    // optional override for ResolverConstraints
}

model Turn {
  // ... existing fields
  resolverLog     Json?    // ResolverResult logged for debugging
}
```

Run migration: `prisma migrate dev --name add_resolver_fields`

---

### 6.7 Rule Loader & Hot-Reload

`lib/simulation/resolver/rules/index.ts`:
- Load all JSON rule files at module init
- Export merged `ResolverRuleset`
- In dev mode: support re-reading files without restart (nice to have, not required)
- Export a `getRuleset(scenarioId)` that applies any scenario-level overrides on top of defaults

---

### 6.8 Unit Tests

Tests at `lib/simulation/resolver/__tests__/`:

- `resolver.test.ts`: given known effects + state, assert expected deltas
- `validation.test.ts`: unknown effects rejected, caps enforced, bounds clamped
- `constraints.test.ts`: per-turn caps stack correctly across multiple effects
- `rules.test.ts`: rule files load without errors, all defined effects have all three intensities

---

## Done When
- Resolver function takes `SemanticEffect[]` + current state and returns validated `ResourceDelta[]`
- Unknown effects are rejected with log entries
- Per-turn caps and field bounds are enforced and logged
- Rule config is in JSON files, not hardcoded
- At least 12 effect types implemented across 4 categories
- Unit tests pass for core resolver, validation, and constraint logic
- Schema migration applied with `resolverConfig` on Scenario and `resolverLog` on Turn
