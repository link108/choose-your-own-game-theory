# AGENTS.md

## Purpose

This repo is for an **AI strategy simulation engine**: a choose-your-own-adventure style simulator where users define actors, incentives, resources, relationships, and world state, then make decisions and simulate consequences over multiple turns.

The product combines:
- structured simulation state
- LLM-assisted reasoning
- narrative rendering
- optional, user-invoked AI authoring assistance

The key rule is simple:

> The backend owns canonical state.  
> The LLM proposes reasoning and consequences.  
> The UI presents the simulation clearly.

---

## Product Summary

Users can:
- create scenarios
- define actors and relationships
- define world state
- choose which actor they control
- take actions each turn
- simulate consequences
- review turn history and updated state

Later, the system may support optional AI-assisted authoring such as:
- actor hydration
- action suggestions
- missing stakeholder suggestions
- scenario cleanup / gap detection

These AI assist features are **not core MVP requirements** and should only run when explicitly requested by the user.

---

## Core Product Principles

### 1. Structured state first
Do not treat narrative text as source of truth.

State should live in structured data such as:
- scenarios
- actors
- relationships
- world state variables
- actions
- turn results
- event logs

### 2. Keep the LLM bounded
The model is useful for:
- actor reactions
- consequence generation
- narrative summaries
- next-step suggestions

The model should **not** be trusted as the canonical owner of:
- resources
- turn count
- actor existence
- relationship values
- world variable truth

### 3. Separation of concerns
Try to keep these layers cleanly separated:
- authoring
- simulation
- validation
- persistence
- narrative rendering
- AI assist

### 4. User approval over auto-magic
If AI suggest/edit features exist, they should produce drafts or suggestions.  
Do not auto-overwrite user-authored content.

---

## Expected Stack

Use practical defaults unless the repo already defines otherwise.

### Suggested app structure
- web app: Next.js / React / TypeScript
- backend API: TypeScript or Python
- database: Postgres
- shared types / schemas: strongly typed and versioned
- validation: schema-based validation at request boundaries

If the repo already has a chosen stack, follow it instead of inventing a new one.

---

## Repo Goals for AI Agents

When working in this repo, optimize for:
- correctness
- traceability
- deterministic state handling
- modularity
- maintainability
- AI-friendly structure
- easy review by a human

Avoid:
- giant route handlers
- hidden business logic in UI code
- raw untyped JSON passing through the stack
- coupling prompts directly to persistence models
- letting generated narrative become canonical state

---

## Recommended Architecture

If creating or extending the codebase, prefer modules along these lines:

```text
/apps/web
/apps/api

/packages/shared-types
/packages/simulation-engine
/packages/llm-prompts
/packages/narrative-renderer
/packages/scenario-builder
/packages/state-validation
```

Possible backend service boundaries:

```text
scenario_service
actor_service
relationship_service
world_state_service
simulation_service
turn_resolution_service
state_validation_service
choice_generation_service
ai_assist_service
```

These are logical boundaries, not strict requirements.

---

## Core Domain Concepts

### Scenario
Top-level simulation container.

Should include:
- id
- title
- description
- initial conflict
- player_actor_id
- turn number
- status

### Actor
Decision-making entity in the world.

Should include:
- id
- scenario_id
- name
- description
- type
- goals
- resources
- constraints
- traits

### Relationship
Describes how actors relate to each other.

Examples:
- trust
- hostility
- dependency
- leverage
- alliance strength

### World State
Scenario-wide variables that affect simulation.

Examples:
- public order
- inflation
- unrest
- legitimacy
- supply shortage
- media temperature

### Action
A structured player or actor move.

Should include:
- actor
- action_type
- optional target
- parameters

### Turn Result
Resolved simulation outcome for one turn.

Should include:
- actor reactions
- validated state changes
- narrative summary
- next choices

### Event Log
Chronological record of meaningful outcomes.

---

## Simulation Rules

### Canonical turn flow
1. User selects an action
2. Backend loads relevant scenario state
3. Backend constructs a structured simulation input
4. LLM proposes reactions and consequences
5. Backend validates the result
6. Backend persists state changes
7. UI renders updated world state, narrative, and next choices

### Important implementation rule
Do not do:
- `LLM narrative -> save paragraph -> assume state changed`

Do:
- `LLM structured proposal -> validate -> persist explicit state deltas -> render narrative`

### Validation expectations
Always validate:
- actor existence
- target existence
- state path validity
- resource bounds
- numeric ranges
- action legality
- unknown entity references

On invalid output:
- reject
- clamp
- regenerate
- or surface an internal error for debugging

Do not silently accept impossible output.

---

## AI Assist Guidance

AI assist is optional and should be designed as a later capability.

Examples:
- “help me flesh out this actor”
- “suggest realistic actions for this faction”
- “what stakeholders are missing?”
- “turn this rough note into a cleaner scenario setup”

Rules:
- only run when explicitly requested
- return drafts or suggestions
- preserve the user-authored original until the user accepts changes
- tag suggestion provenance if possible

Useful provenance fields:
- source: user | ai_suggested | ai_accepted
- draft_status: draft | accepted | rejected

If these fields do not exist yet, keep the architecture open for them.

---

## Data Modeling Guidance

Prefer structured relational storage for core entities.

Good candidates for dedicated tables:
- scenarios
- actors
- actor_goals
- actor_resources
- relationships
- world_state_entries
- actions
- turn_results
- event_logs

Use JSON only where flexibility clearly matters.

Do not collapse the whole simulation into one giant opaque JSON blob unless there is a strong reason.

---

## Frontend Guidance

Frontend should make the simulation understandable.

Priorities:
- clear actor editor
- readable world state panel
- obvious current role
- obvious current turn
- event / timeline history
- clear action selection UI
- clear separation between:
  - current facts
  - player input
  - AI-generated suggestion
  - narrative flavor text

Avoid overly magical UI that hides what actually changed.

Users should be able to answer:
- what did I choose?
- what changed?
- why did it change?
- what can I do next?

---

## API Guidance

Prefer thin route handlers.

Route handlers/controllers should:
- parse request
- validate request
- call service
- return typed response

Do not put business logic directly in route files.

Prefer:
- request schema
- service layer
- repository / persistence layer
- typed response schema

---

## Prompting Guidance

Prompts should be structured and bounded.

Prefer prompt inputs like:
- current turn
- player action
- relevant actors
- actor goals and constraints
- relevant relationships
- relevant world state
- recent event summaries

Prefer model outputs like:
- actor reactions
- explicit state changes
- narrative summary
- next choices

If needed, use a two-pass pattern:
1. reasoning pass
2. normalization / structured output pass

That is safer than asking for one huge freeform answer.

---

## Testing Guidance

Focus heavily on testability.

Good test targets:
- state validation
- turn resolution
- bounds checking
- schema validation
- action normalization
- persistence behavior
- prompt-to-structured-output normalization
- regression tests for scenario consistency

At minimum, important logic should have:
- unit tests for core services
- validation tests for bad inputs
- integration tests for turn resolution flow

If LLM calls are involved, abstract them behind interfaces so they can be mocked.

---

## Coding Style Guidance

General preferences:
- small modules
- explicit names
- typed schemas
- clear domain boundaries
- minimal surprise
- easy for another agent or engineer to pick up fast

Prefer:
- composition over giant classes
- deterministic helpers for state updates
- explicit DTOs / typed interfaces
- comments only where the “why” is not obvious

Avoid:
- giant files
- mixed UI + domain logic
- prompt strings scattered everywhere
- persistence code mixed with simulation logic

---

## Definition of Done

A feature is not done just because the UI looks right.

A feature should usually be considered done when:
1. state is modeled cleanly
2. API / service boundaries are reasonable
3. validation exists
4. persistence exists where needed
5. happy path works
6. obvious failure modes are handled
7. tests cover meaningful behavior
8. docs or inline guidance are updated if architecture changed

---

## MVP Priorities

When in doubt, prioritize:
1. scenario CRUD
2. actor CRUD
3. relationship + world state editing
4. turn submission
5. turn resolution
6. validation
7. history/timeline
8. UI clarity

Defer:
- multiplayer
- deep hidden state
- autonomous long-run sim modes
- complex marketplace/sharing systems
- vector-memory-heavy architecture

---

## How to Work as an Agent in This Repo

When asked to implement something:
1. understand which layer it belongs to
2. update or create the schema/types first
3. implement service logic
4. wire API/UI after domain logic is sound
5. add tests
6. keep files modular
7. avoid broad refactors unless necessary

When asked to propose a design:
- keep it practical
- keep it modular
- keep it reviewable
- explain tradeoffs briefly
- do not over-engineer for hypothetical future scale unless directly relevant

---

## Final Reminder

This repo should feel like:
- a simulation product first
- an AI product second

The AI makes the simulation richer.  
The structure is what makes it reliable.
