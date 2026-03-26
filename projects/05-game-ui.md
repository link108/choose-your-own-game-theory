# Project 5: Game UI

## Goal
Build the player-facing game experience — the page viewer, choice panel, state summary, and turn history. This is where everything comes together.

## Dependencies
- Project 3 (Simulation Engine) complete
- Project 4 (LLM Integration) complete (or at least stub-functional)

## Subprojects

### 5.1 Game Session Page Layout
`/scenarios/[id]/play` — the main game interface

Layout (single page, no navigation away during play):
```
┌──────────────────────────────────────────────┐
│  Scenario Title              Turn N    [Menu] │
├──────────────┬───────────────────────────────┤
│              │                               │
│  State       │   Narrative                   │
│  Summary     │                               │
│  Panel       │   (scrollable story text)     │
│              │                               │
│  - Resources │                               │
│  - Actors    │                               │
│  - Tensions  │                               │
│              ├───────────────────────────────┤
│              │                               │
│              │   Choices                     │
│              │   [ Option A ]                │
│              │   [ Option B ]                │
│              │   [ Option C ]                │
│              │                               │
├──────────────┴───────────────────────────────┤
│  Turn History (collapsible)                  │
└──────────────────────────────────────────────┘
```

### 5.2 Narrative Panel
- Displays the current turn's narrative text
- Markdown rendering (for LLM output formatting)
- Title at top
- Smooth transition/animation when new turn loads (subtle fade-in)
- Loading state while turn resolves (skeleton or spinner)

### 5.3 Choice Panel
- Shows 2-5 choice buttons/cards
- Each choice shows:
  - Short label (the action)
  - Description (what it means / likely consequences)
- Click a choice → confirm dialog ("Are you sure?") → submit
- Disabled state while turn is resolving
- Keyboard shortcuts (1-5) for quick selection — stretch goal

### 5.4 State Summary Panel
- Sidebar showing player-visible state:
  - **Your Resources** — list with values, color-coded changes (green up, red down)
  - **Key Actors** — name + brief status + relationship to player
  - **Active Tensions** — flagged risks and opportunities
  - **World State** — relevant world variables
- Animate value changes between turns (number tick up/down)
- Expandable sections for detail

### 5.5 Turn History
- Collapsible panel at bottom (or toggleable drawer)
- List of past turns:
  - Turn number
  - Choice made
  - Brief summary of outcome
- Click a past turn to expand and see full narrative
- Useful for context when returning to a game

### 5.6 Session Management
- Start game → initial page (turn 0) generated from scenario
- "Pause" → saves state, return to scenario list
- "Resume" → loads from last turn
- "End Game" → marks session as completed
- Multiple sessions per scenario (replay from different starting choices)

### 5.7 Loading & Error States
- Turn resolution loading: show narrative skeleton + "Resolving..." indicator
- LLM failure: show error message + "Retry" button
- Offline/disconnected: appropriate message
- Optimistic UI: disable choices immediately on click

### 5.8 Responsive Design
- Desktop-first but should work on tablet
- Mobile: stack panels vertically (state summary collapses to top bar)
- Touch-friendly choice buttons

## Done When
- Player can start a game from a configured scenario
- Turn 0 shows opening narrative + first choices
- Submitting a choice triggers full turn resolution and renders the next page
- State panel updates with changes highlighted
- Turn history shows all past turns
- Sessions can be paused and resumed
- The whole loop works: setup scenario → start game → play through multiple turns
