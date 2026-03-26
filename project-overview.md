# Project Overview: AI Strategy Simulation Engine

## 1. Product Vision

Build a **choose-your-own-adventure style strategy simulator** where users define actors, incentives, and environments, then explore outcomes through interactive decisions.

The system simulates how rational (or semi-rational) actors respond to decisions using structured state + LLM-assisted reasoning.

Core idea:

> Define a world → make a decision → simulate consequences → repeat

This is **not just a game** — it’s a:

* strategy sandbox
* negotiation simulator
* political/economic modeling tool
* narrative engine

---

## 2. Core Principles

### 2.1 Structured State First

All simulation runs on structured data:

* actors
* relationships
* world state
* events

The LLM **does not own state**, it only proposes changes.

---

### 2.2 Deterministic Engine + Probabilistic Reasoning

* Backend enforces rules and state transitions
* LLM provides reasoning, reactions, and narrative

---

### 2.3 Separation of Concerns

* Simulation logic ≠ narrative output
* State updates ≠ storytelling

---

### 2.4 AI is Optional (User-Controlled)

AI is used:

* for simulation
* for optional authoring assistance

AI is **never forced for creation/editing**.

---

## 3. MVP Scope

### 3.1 User Capabilities

User can:

* create a scenario
* define actors
* define world state
* choose a role (actor)
* make decisions each turn
* see outcomes and updated state
* continue simulation across turns

---

### 3.2 MVP Features

#### Scenario Creation

* title, description
* initial conflict
* world variables

#### Actor Definition

* goals (with priority)
* resources
* constraints
* traits (risk, cooperation, aggression)

#### Relationships

* trust
* hostility
* dependency

#### Simulation Loop

1. user selects action
2. system gathers relevant state
3. LLM simulates reactions
4. backend validates + applies changes
5. updated state is displayed
6. new choices generated

---

### 3.3 Non-Goals (for MVP)

* multiplayer
* deep memory systems
* vector search
* long-running simulations (100+ turns)
* complex hidden state systems

---

## 4. System Architecture

### 4.1 High-Level Components

#### Frontend (React / Next.js)

* scenario editor
* actor editor
* world state dashboard
* turn viewer (timeline)
* choice panel

---

#### Backend API

Responsible for:

* scenario CRUD
* actor CRUD
* simulation execution
* state validation
* history persistence

---

#### Simulation Engine

Core loop:

```
input:
  - current state
  - player action

process:
  - select relevant actors
  - call LLM for reactions
  - normalize output
  - validate changes
  - update state

output:
  - state changes
  - narrative summary
  - next choices
```

---

#### LLM Layer

Handles:

* actor reaction simulation
* outcome explanation
* choice generation
* (future) authoring assistance

---

#### Database (Postgres)

Stores:

* scenarios
* actors
* relationships
* world state
* events
* actions
* turn results

---

## 5. Data Model

### 5.1 Scenario

```json
{
  "id": "scenario_001",
  "title": "Housing Crisis",
  "description": "A city faces rising rents and unrest.",
  "player_actor_id": "mayor",
  "turn": 1,
  "status": "active"
}
```

---

### 5.2 Actor

```json
{
  "id": "mayor",
  "scenario_id": "scenario_001",
  "name": "Mayor",
  "goals": [
    {"text": "Maintain order", "priority": 10}
  ],
  "resources": [
    {"name": "Political capital", "value": 70}
  ],
  "constraints": [
    "Upcoming election"
  ],
  "traits": {
    "risk_tolerance": 0.4,
    "cooperation": 0.7
  }
}
```

---

### 5.3 Relationship

```json
{
  "source_actor_id": "mayor",
  "target_actor_id": "union",
  "trust": 40,
  "hostility": 20
}
```

---

### 5.4 World State

```json
{
  "variables": {
    "public_order": 65,
    "economic_pressure": 80
  }
}
```

---

### 5.5 Action

```json
{
  "actor_id": "mayor",
  "action_type": "negotiate",
  "parameters": {
    "offer": 10
  }
}
```

---

### 5.6 Turn Result

```json
{
  "turn": 3,
  "state_changes": [
    {"path": "world.public_order", "delta": 5}
  ],
  "actor_responses": [
    {"actor_id": "union", "reaction": "escalate"}
  ],
  "narrative": "Negotiations stall and tensions rise."
}
```

---

### 5.7 Event Log

```json
{
  "turn": 3,
  "summary": "Union escalated strike",
  "effects": [
    {"field": "public_support", "delta": 10}
  ]
}
```

---

## 6. Simulation Flow

### Step-by-step

1. User selects action
2. Backend constructs simulation input:

   * actor states
   * world state
   * relationships
   * recent history
3. LLM generates:

   * actor reactions
   * state changes
   * narrative
4. Backend validates:

   * no illegal state changes
   * resource limits respected
5. State is updated
6. New choices generated
7. UI updates

---

## 7. Validation Layer (Important)

Backend must enforce:

* resource bounds (no infinite money, etc)
* allowed variable ranges
* actor capability limits
* no hallucinated entities

If invalid:

* clamp values OR
* request regeneration

---

## 8. AI Assist (Post-MVP)

Optional, user-triggered features:

### 8.1 Actor Hydration

User provides rough input → AI expands into:

* goals
* resources
* traits

---

### 8.2 Action Suggestions

Given a state, suggest:

* strategic moves
* risky moves
* diplomatic options

---

### 8.3 Scenario Generation

Generate:

* actors
* relationships
* initial conflict

---

### 8.4 Gap Detection

Suggest:

* missing actors
* missing incentives
* unrealistic setups

---

### Important Constraint

AI suggestions are:

* **never auto-applied**
* always user-reviewed
* stored as draft until accepted

---

## 9. Suggested Repo Structure

```
/apps/web
/apps/api

/packages/shared-types
/packages/simulation-engine
/packages/llm-prompts
/packages/narrative-renderer
/packages/scenario-builder
```

---

## 10. Milestones

### Milestone 1: Core Models

* scenarios
* actors
* relationships
* world state

---

### Milestone 2: Basic UI

* create scenario
* define actors
* define world

---

### Milestone 3: Simulation Loop

* submit action
* call LLM
* apply results
* display outcome

---

### Milestone 4: Turn History

* event log
* timeline UI

---

### Milestone 5: Choice System

* predefined actions
* basic LLM-generated options

---

### Milestone 6: Polish

* narrative improvements
* UI clarity
* error handling

---

## 11. Future Ideas

* hidden information
* multi-agent multiplayer
* branching timelines
* simulation replay
* “run 50 turns” auto mode
* scoring / win conditions
* scenario marketplace
* training modes (negotiation, leadership)

---

## 12. Product Positioning

Not just “game theory”.

Better framing:

* Interactive Strategy Simulator
* AI Narrative Strategy Engine
* Multi-Agent Decision Lab

---

## 13. Summary

This system combines:

* structured simulation
* AI reasoning
* interactive storytelling

The key innovation:

> Users define incentives → AI simulates consequences → system enforces reality

---

## End of Document

