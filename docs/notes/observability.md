# Observability / Decision Trace

Status: deferred until the current scenario package migration reaches a stable milestone.

## Goal

Add high-signal observability for the simulation engine and LLM-driven turn pipeline without exposing raw chain-of-thought.

This work should capture:

- pipeline chosen per turn
  - scenario package
  - proposal pipeline
  - semantic effect pipeline
  - legacy fallback
- LLM call boundaries and timings
- prompt type used
- parsed output summary
- validation failures
- rejected effects / rejected operations
- retries and fallback reasons
- choice regeneration events
- player-suggested action acceptance / rejection
- committed state changes

The simulation remains the source of truth. Observability should explain execution, not replace state.

## Non-Goals

- storing or displaying raw hidden chain-of-thought
- making Langfuse the only source of debug truth
- coupling core simulation correctness to external tracing infrastructure

## Recommended Implementation Order

### Phase 1: Internal Structured Trace Model

Add an internal trace model first, independent of Langfuse.

Suggested module:

```text
app/src/lib/observability/
  trace.ts
  types.ts
  store.ts
```

Suggested captured structure:

```ts
interface TurnTrace {
  traceId: string;
  turn: number;
  sessionId: string;
  scenarioId: string;
  pipeline: "scenarioPackage" | "proposal" | "semantic" | "legacy";
  spans: TraceSpan[];
  summary: {
    retries: number;
    fallback: boolean;
    suggestedActionAccepted?: boolean;
    rejectedCount: number;
  };
}

interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  type:
    | "turn"
    | "llm"
    | "validation"
    | "resolution"
    | "choice_generation"
    | "trigger"
    | "render";
  startedAt: string;
  endedAt?: string;
  status: "ok" | "error" | "rejected";
  metadata?: Record<string, unknown>;
}
```

### Phase 2: Debug Panel Visualization

Extend the in-app debug panel to show:

- trace ID
- pipeline used
- span timeline
- retry count
- fallback flags
- validation/rejection summaries
- suggested action accepted/rejected

Keep the local UI focused on compact summaries and recent trace spans.

### Phase 3: Langfuse Export

Use Langfuse as an exporter for the same trace model.

Recommended direction:

- use Langfuse JS/TS tracing with OpenTelemetry
- instrument manually at first instead of wrapping the provider abstraction immediately
- export the same top-level spans already represented in the internal trace model

Relevant docs:

- https://langfuse.com/docs/observability/sdk/typescript/overview
- https://langfuse.com/docs/observability/sdk/typescript/instrumentation
- https://langfuse.com/integrations/model-providers/openai-js

## Integration Points

Likely instrumentation points:

- `resolveTurn`
- `resolveTurnWithScenarioPackage`
- `resolveScenarioEffectInvocations`
- `getLLMChoiceScenarioEffects`
- `getLLMActorResponsesWithScenarioEffects`
- `getLLMChoices`
- choice validation / regeneration
- `generatePage`

Likely UI integration points:

- `DebugPanel`
- turn history debug export

Likely API persistence points:

- attach compact trace summary to the turn debug payload
- optionally persist `traceId` on `Turn`

## Guardrails

- do not log secrets or full provider credentials
- do not treat raw prompt text as always safe to expose in the debug UI
- default to summary-level visibility in the app
- allow deeper inspection through tracing infrastructure, not the primary gameplay UI

## When To Resume

Resume this project after:

1. scenario package-backed turn resolution is stable
2. choice generation/validation is stable
3. current migration no longer needs frequent schema changes

At that point, observability work will land on a moving target less often and the traces will be more useful.
