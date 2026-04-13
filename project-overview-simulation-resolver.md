# Project Overview: Simulation Resolver System

## 1. Purpose

Introduce a **deterministic simulation resolver layer** that converts LLM-generated semantic consequences into consistent, validated numerical state updates.

This replaces direct numeric manipulation by the LLM.

---

## 2. Problem

Current system:

* LLM directly proposes numeric changes (e.g., `threat +7`, `gold -3`)
* Leads to:

  * inconsistency
  * drift
  * lack of tuning control
  * unrealistic outcomes

---

## 3. Solution

Shift to a **two-stage simulation model**:

### Stage 1: LLM (Semantic Layer)

LLM outputs:

* actions
* events
* consequence tags

Example:

```json
{
  "effects": [
    {
      "type": "military_escalation",
      "intensity": "moderate"
    },
    {
      "type": "market_instability",
      "intensity": "major"
    }
  ]
}
```

---

### Stage 2: Resolver (Deterministic Layer)

Backend maps effects → numeric changes using rules.

Example:

```json
{
  "military_escalation": {
    "moderate": {
      "threat": +15,
      "stability": -5
    }
  }
}
```

---

## 4. Core Concept

> The LLM describes *what happens*
> The resolver determines *how much it affects the system*

---

## 5. Architecture

### Inputs

* semantic effects
* current state
* scenario ruleset

### Outputs

* validated state changes
* updated variables
* applied constraints

---

### Flow

1. LLM returns semantic effects
2. Resolver:

   * maps effects → numeric changes
   * applies scaling rules
   * enforces bounds
3. State updated
4. Page rendered

---

## 6. Effect System

Each effect includes:

```json
{
  "type": "string",
  "intensity": "minor | moderate | major",
  "scope": "optional",
  "target": "optional"
}
```

---

## 7. Resource Categories

### Hard Resources

* gold
* food
* fuel
* materials

Rules:

* must obey conservation
* direct changes only

---

### Positional Resources

* influence
* morale
* legitimacy
* trust

Rules:

* affected by events and relationships
* slower changes

---

### Risk Indicators

* threat
* instability
* exposure
* conflict risk

Rules:

* derived or semi-derived
* capped per turn

---

## 8. Resolver Rules

### Example

```yaml
military_escalation:
  minor:
    threat: +5
    stability: -2
  moderate:
    threat: +15
    stability: -5
  major:
    threat: +30
    stability: -10
```

---

## 9. Constraints

* max delta per turn
* min/max bounds per variable
* actor capability limits
* effect stacking rules

---

## 10. Validation Layer

Resolver must:

* reject unknown effects
* clamp excessive deltas
* ensure no invalid state transitions
* log applied transformations

---

## 11. Benefits

* consistency across turns
* tunable gameplay
* reusable across scenarios
* easier debugging
* more realistic outcomes

---

## 12. MVP Scope

Include:

* effect → variable mapping
* intensity system
* per-turn constraints
* basic rule config

Exclude:

* complex derived systems
* cross-effect interactions (later)

---

## 13. Future Extensions

* probabilistic modifiers
* actor-specific multipliers
* environment modifiers
* cascading systems (economy, supply chains)
* machine-learned tuning

---

## 14. Summary

This system ensures:

> The simulation remains stable, predictable, and tunable
> while still allowing LLM creativity at the semantic level

---

## End of Document

