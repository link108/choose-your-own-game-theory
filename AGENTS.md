# AGENTS.md

## Purpose

This repo implements an **AI-powered choose-your-own-adventure simulation engine**.

The system combines:

* structured simulation state
* LLM-driven reasoning
* page-based narrative UX

---

## Core Concept: Turn Pages

The primary unit of user experience is a **Turn Page**.

Each turn must produce:

* narrative (what happened)
* state summary (what matters)
* choices (what the player can do next)

Important:

* UI consumes pages, not raw state
* Always generate choices with each page

---

## Simulation vs Presentation

### Simulation Layer

* owns canonical state
* applies validated changes
* enforces rules

### Presentation Layer

* generates pages
* produces narrative
* formats choices

Do not mix these concerns.

---

## LLM Responsibilities

The LLM is responsible for:

* generating consequence narrative
* proposing actor behavior
* generating next choices
* framing the situation

The LLM must NOT:

* directly mutate state
* invent entities without validation
* act as source of truth

---

## Turn Flow

1. User selects a choice
2. Backend gathers state
3. LLM proposes outcomes
4. Backend validates changes
5. State is updated
6. Page is generated and returned

---

## Choice Generation Rules

Choices must:

* be valid given state
* be distinct
* reflect different strategies
* move the scenario forward

Avoid:

* duplicate options
* impossible actions
* cosmetic/no-op choices

---

## State Handling

### Player-visible state

* resources
* current situation
* known actors
* active tensions

### Hidden state

* actor intentions
* future events
* internal weights

Do not expose hidden state unless revealed.

---

## Validation Requirements

Always validate:

* state bounds
* actor capabilities
* existence of entities
* transition legality

Reject or correct invalid outputs.

---

## Architecture Guidelines

Keep modules clean:

* simulation_engine
* state_validation
* narrative_renderer
* choice_generation
* llm_prompts

Avoid:

* business logic in UI
* mixing persistence and simulation
* untyped data flow

---

## Development Priorities

1. Turn pages (core UX)
2. Simulation correctness
3. Validation
4. Choice quality
5. Narrative clarity

---

## AI Assist Features (Future)

* actor generation
* scenario suggestions
* action suggestions

Rules:

* must be user-invoked
* must produce drafts
* must not auto-apply

---

## Testing Expectations

Focus on:

* turn resolution correctness
* validation
* state transitions
* choice generation
* regression consistency

Mock LLM where possible.

---

## Final Reminder

This is not just a game.

It is:

> A structured simulation system presented as an interactive narrative.

The simulation creates truth.
The page creates experience.

---

## End of Document

