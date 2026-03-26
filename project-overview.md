# Project Overview: AI Strategy Narrative Simulator

## 1. Product Vision

Build a **choose-your-own-adventure style strategy simulator** where users define actors, incentives, and environments, then explore outcomes through interactive decisions.

The system combines:

* structured simulation (truth layer)
* LLM-driven reasoning (decision + narrative)
* page-based storytelling (UX layer)

Core idea:

> Define a world → make a choice → experience consequences → repeat

---

## 2. Core Experience (Important)

The product is **page-driven**, not freeform.

Each turn produces a **Rendered Page**:

* narrative (what happened)
* state summary (what matters now)
* choices (what you can do next)

Flow:

1. User reads current page
2. User selects a choice
3. System resolves outcome (simulation + LLM)
4. System generates next page

---

## 3. Core Principles

### 3.1 Structured State First

All simulation runs on structured data:

* actors
* relationships
* world state
* events

The LLM **does not own state**, it proposes changes.

---

### 3.2 Simulation vs Presentation

* Simulation = canonical truth
* Page = player-facing representation

Never rely on narrative as state.

---

### 3.3 AI is Assistive, Not Authoritative

LLM is used for:

* reasoning
* consequences
* narrative
* choice generation

Backend enforces:

* rules
* constraints
* consistency

---

### 3.4 Player Clarity Over Complexity

Users should always understand:

* what just happened
* what changed
* what they can do next

---

## 4. System Architecture

### Frontend (React / Next.js)

* scenario editor
* actor editor
* page viewer (main UI)
* choice panel
* state summary panel

---

### Backend API

* scenario management
* actor management
* simulation execution
* validation
* persistence

---

### Simulation Engine

Handles:

* actor behavior
* world changes
* event generation
* turn resolution

---

### LLM Layer

Handles:

* consequence narration
* actor reasoning
* choice generation
* scenario assistance (later)

---

### Database (Postgres)

Stores:

* scenarios
* actors
* relationships
* world state
* events
* actions
* turn results
* rendered pages

---

## 5. Core Data Model

### ScenarioState (canonical)

* actors
* relationships
* world variables
* resources
* flags
* time
* event history

---

### TurnResolution (internal)

```json
{
  "turn": 5,
  "player_choice_id": "negotiate",
  "state_changes": [...],
  "events": [...],
  "actor_responses": [...]
}
```

---

### RenderedPage (player-facing)

```json
{
  "turn": 5,
  "title": "An Uneasy Offer",
  "body": "The governor listens carefully...",
  "state_summary": {...},
  "choices": [...]
}
```

---

## 6. Simulation Flow

1. User selects a choice
2. Backend builds simulation context
3. LLM proposes:

   * actor actions
   * consequences
4. Backend:

   * validates
   * applies state changes
5. System generates:

   * TurnResolution
   * RenderedPage
6. UI displays new page

---

## 7. Turn Page Requirements

Each page must include:

### Narrative

* what happened
* who is involved
* current tension

### State Summary

* player role
* key resources
* important actors
* active tensions
* risks/opportunities

### Choices

* 2–5 options
* meaningful and distinct
* grounded in current state

---

## 8. Choice System

Choices should:

* reflect available actions
* vary in risk/reward
* align with actor capabilities
* move the scenario forward

Bad choices:

* redundant
* impossible
* purely cosmetic

---

## 9. State Visibility

Split state into:

### Player-visible

* resources
* known actors
* obvious tensions
* current situation

### Simulation-private

* hidden intentions
* future events
* internal weights
* secret relationships

---

## 10. Validation Layer

Must enforce:

* resource bounds
* actor capabilities
* valid state transitions
* no hallucinated entities

---

## 11. MVP Scope

### Included

* scenario creation
* actor creation
* world state definition
* turn-based simulation
* rendered pages
* choice system
* event history

---

### Excluded (for now)

* multiplayer
* deep hidden systems
* long autonomous simulations
* vector-based memory systems

---

## 12. Future Features

* branching timelines
* “simulate N turns”
* custom user actions
* AI-assisted authoring
* scenario marketplace
* negotiation training mode

---

## 13. Summary

This system is:

> A page-based interactive narrative engine powered by structured simulation and AI reasoning.

The key loop:

> choice → simulation → consequence → next page

---

## End of Document

