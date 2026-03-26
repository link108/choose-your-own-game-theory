# Project 2: Scenario Editor

## Goal
Build the full scenario creation and editing UI. Users can define a world, add actors with resources/goals/traits, set up relationships, and define world variables. This is the "setup phase" before gameplay.

## Dependencies
- Project 1 (Foundation) complete

## Subprojects

### 2.1 Scenario List & Creation
- Home page shows list of existing scenarios (name, status, actor count, last updated)
- "New Scenario" button opens creation flow
- Scenario card links to editor
- Delete scenario with confirmation

### 2.2 Scenario Editor — World Setup
- Scenario name + description fields
- World description textarea (rich text not needed, plain text is fine)
  - This is the "setting" — describe the world, era, context
- World variables section:
  - Add/remove world variables (e.g. "Season: Winter", "Trade Route Status: Open", "War Tension: 70")
  - Each variable has: name, type (number/string/boolean), value, optional min/max for numbers
  - Inline editing

### 2.3 Scenario Editor — Actor Management
- Actor list panel within scenario editor
- "Add Actor" button
- Per-actor editor (could be inline expandable or a side panel):
  - **Name** — text field
  - **Description** — textarea (who are they, what's their background)
  - **Goals** — list of goals (add/remove, each is a text string)
  - **Traits** — tag-style input (e.g. "aggressive", "diplomatic", "cautious")
  - **Is Player** — toggle (exactly one actor should be the player character)
  - **Resources** — dynamic list:
    - Resource name (e.g. "Gold", "Troops", "Influence")
    - Current value (number)
    - Min/Max bounds
    - Add/remove resources
- Delete actor with confirmation
- Reorder actors (drag or up/down arrows — stretch goal)

### 2.4 Scenario Editor — Relationships
- Relationship editor between actors
- Matrix or list view showing actor pairs
- Per relationship:
  - Type (dropdown: ally, rival, neutral, vassal, overlord, trade partner, custom)
  - Strength (slider 0-100)
  - Description (optional text)
- Only show relationships between existing actors
- Auto-create symmetric relationship entries (if A→B is "ally", show B→A as "ally" too, editable independently)

### 2.5 Scenario Editor — Review & Launch
- Summary view of the scenario before starting a game session:
  - World overview
  - Actor summary cards
  - Relationship graph (stretch: visual node graph; MVP: simple list)
  - World variables
- "Start Game" button → creates a GameSession with initial state snapshot → redirects to play page
- Validation before launch:
  - At least one player actor
  - At least one non-player actor
  - All actors have names
  - Scenario has a description

### 2.6 API Routes for Actors, Resources, Relationships
- `GET/POST /api/scenarios/[id]/actors` — list and create actors
- `GET/PUT/DELETE /api/actors/[id]` — single actor CRUD
- `POST/PUT/DELETE /api/actors/[id]/resources` — manage resources
- `GET/POST/PUT/DELETE /api/relationships` — manage relationships
- `POST /api/scenarios/[id]/sessions` — start a new game session (snapshot state)

## UI Notes
- Use shadcn Card, Dialog, Input, Textarea, Select, Badge, Slider, Switch components
- Keep layout clean: scenario editor as a multi-section page with clear sections
- Autosave or explicit save button (explicit save is simpler for MVP)
- Form validation with inline error messages

## Done When
- User can create a scenario from scratch
- User can add/edit/delete actors with full detail (goals, traits, resources)
- User can set up relationships between actors
- User can define world variables
- User can review and launch a game session
- All data persists in Postgres
