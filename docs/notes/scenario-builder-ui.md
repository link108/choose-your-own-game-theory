# Scenario Builder UI

Current objective:

- make `scenarioPackage` authorable from the scenario editor
- keep the UI constrained and validation-backed
- avoid building a full visual DSL editor prematurely

Implemented so far:

- Package tab in scenario editor
- package validation + raw JSON inspection
- choice policy editing
- actor capability editing
- trigger rule editing

Next planned slices:

1. object type editing
2. object editing
3. package draft generation from prompt
4. stronger narrative grounding against committed turn facts

Deliberate constraints:

- use simple forms for the top-level shell of each package concept
- allow JSON only for nested structures where a full editor would be too large
- rely on existing package validation rather than duplicating validation logic in the UI
- keep legacy runtime paths intact until the package-backed path is proven

Not in scope for this note:

- Langfuse / observability work
- full prompt-to-package builder orchestration
- removal of legacy resolver paths
