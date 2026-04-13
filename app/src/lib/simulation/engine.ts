import type {
  ScenarioState,
  TurnResult,
  Choice,
  StateChange,
  GameEvent,
  PageData,
  ResolverSummary,
  ResolverDebug,
} from "@/lib/types";
import { cloneState, applyChanges, applyDelta, buildStateSummary } from "./state";
import {
  validateStateChanges,
  validateEntityReferences,
} from "./validation";
import {
  resolveEffects,
  validateEffects,
  getRuleset,
  getConstraints,
} from "./resolver";
import type { SemanticEffect, ResolverResult } from "./resolver";
import {
  getLLMActorResponses,
  getLLMActorResponsesWithEffects,
  getLLMChoiceEffects,
  getLLMWorldUpdate,
  getLLMNarrative,
  getLLMChoices,
  getLLMInitialPage,
} from "../llm/game-llm";

/**
 * Resolve a single turn of the simulation.
 *
 * When scenarioResolverConfig is present the resolver pipeline runs:
 *   choice-effects + actor effects → resolveEffects → apply aggregatedDeltas
 *
 * When it is absent (legacy scenarios) the old direct-delta pipeline is used
 * with a console warning.
 */
export async function resolveTurn(
  state: ScenarioState,
  playerChoice: Choice,
  availableChoices: Choice[],
  scenarioResolverConfig?: unknown
): Promise<TurnResult> {
  // 1. Validate player choice
  const isValidChoice = availableChoices.some((c) => c.id === playerChoice.id);
  if (!isValidChoice) {
    throw new Error(`Invalid choice: "${playerChoice.id}" is not available`);
  }

  // Route to the resolver pipeline when config is present
  if (scenarioResolverConfig != null) {
    return resolveTurnWithResolver(state, playerChoice, scenarioResolverConfig);
  }

  // Fallback: old direct-delta pipeline
  console.warn(
    "[engine] No resolverConfig on scenario — falling back to legacy numeric pipeline"
  );
  return resolveTurnLegacy(state, playerChoice);
}

// ---------------------------------------------------------------------------
// Resolver pipeline (Project 7)
// ---------------------------------------------------------------------------

async function resolveTurnWithResolver(
  state: ScenarioState,
  playerChoice: Choice,
  scenarioResolverConfig: unknown
): Promise<TurnResult> {
  const newState = cloneState(state);
  newState.turn = state.turn + 1;

  const ruleset = getRuleset(scenarioResolverConfig);
  const constraints = getConstraints(scenarioResolverConfig);
  const validEffectTypes = Object.keys(ruleset);

  // 2. Get player choice effects + actor effects in parallel
  const [choiceEffects, actorData] = await Promise.all([
    getLLMChoiceEffects(state, playerChoice, validEffectTypes).catch((err) => {
      console.warn("[engine] Choice effects LLM call failed:", err);
      return [] as SemanticEffect[];
    }),
    getLLMActorResponsesWithEffects(state, playerChoice, validEffectTypes).catch(
      (err) => {
        console.warn("[engine] Actor effects LLM calls failed:", err);
        return [] as Awaited<ReturnType<typeof getLLMActorResponsesWithEffects>>;
      }
    ),
  ]);

  // 3. Merge all effects
  const actorEffects: SemanticEffect[] = actorData.flatMap((a) => a.effects);
  const allEffects: SemanticEffect[] = [...choiceEffects, ...actorEffects];

  // 4. Pre-validate then resolve
  const { valid: validEffects, rejected: preRejected } = validateEffects(allEffects, ruleset, constraints);
  if (preRejected.length > 0) {
    console.warn("[engine] Effect validation warnings:", preRejected);
  }

  const resolverResult: ResolverResult = resolveEffects(
    validEffects,
    newState,
    ruleset,
    constraints
  );

  if (resolverResult.rejectedEffects.length > 0) {
    console.warn(
      `[engine] ${resolverResult.rejectedEffects.length} effect(s) rejected:`,
      resolverResult.rejectedEffects.map((r) => `${r.effect.type}: ${r.reason}`)
    );
  }

  // 5. Detect full fallback (all effects rejected, nothing applied)
  const isFallback =
    resolverResult.resolutions.length === 0 &&
    resolverResult.rejectedEffects.length > 0;

  if (isFallback) {
    console.warn("[engine] All effects rejected — generating fallback turn");
  }

  // 6. Apply aggregatedDeltas to state
  const stateChanges: StateChange[] = [];
  for (const delta of resolverResult.aggregatedDeltas) {
    const change = applyDelta(newState, delta);
    if (change) stateChanges.push(change);
  }

  // 7. Build resolver summary for narration
  const clampedFields = [
    ...new Set(
      resolverResult.aggregatedDeltas
        .filter((d) => d.clampedFrom !== undefined)
        .map((d) => d.field)
    ),
  ];

  const resolverSummary: ResolverSummary = {
    effectsApplied: resolverResult.resolutions.map(
      (r) => `${r.effect.type} (${r.effect.intensity})`
    ),
    clamped: clampedFields,
    rejected: resolverResult.rejectedEffects.map((r) => r.effect.type),
    fallback: isFallback,
  };

  // 8. Build actor responses for TurnResult (backward compat shape)
  const actorResponses = actorData.map((a) => ({
    actorId: a.actorId,
    actorName: a.actorName,
    action: a.action,
    reasoning: a.reasoning,
    proposedChanges: [] as StateChange[],
  }));

  // 9. Generate events
  const events = generateEventsFromResolver(
    state,
    playerChoice,
    actorResponses,
    resolverResult,
    stateChanges
  );
  newState.eventHistory = [...state.eventHistory, ...events];

  // 10. Build resolverDebug (populated regardless; API route guards by NODE_ENV)
  const resolverDebug: ResolverDebug = {
    effectsReceived: allEffects,
    effectsApplied: resolverResult.resolutions.map((r) => ({
      effect: { type: r.effect.type, intensity: r.effect.intensity },
      warnings: r.warnings,
      clamped: r.clamped,
    })),
    effectsRejected: resolverResult.rejectedEffects.map((r) => ({
      effect: { type: r.effect.type, intensity: r.effect.intensity },
      reason: r.reason,
    })),
    constraintsApplied: resolverResult.appliedConstraints,
  };

  // 11. Persist resolverLog on Turn via return value (API route handles the write)
  return {
    turn: newState.turn,
    playerChoice: { id: playerChoice.id, text: playerChoice.text },
    stateChanges,
    events,
    actorResponses,
    newState,
    resolverSummary,
    resolverDebug,
  };
}

// ---------------------------------------------------------------------------
// Legacy pipeline (no resolverConfig)
// ---------------------------------------------------------------------------

async function resolveTurnLegacy(
  state: ScenarioState,
  playerChoice: Choice
): Promise<TurnResult> {
  const newState = cloneState(state);
  newState.turn = state.turn + 1;

  // Get actor responses via LLM
  const actorResponses = await getLLMActorResponses(state, playerChoice);

  // Collect resource changes from actor responses
  const resourceChanges: StateChange[] = actorResponses
    .flatMap((r) => r.proposedChanges)
    .filter((c) => c.type === "resource");

  // Validate and apply resource changes
  const refErrors = validateEntityReferences(state, resourceChanges);
  if (refErrors.length > 0) {
    console.warn("Entity reference errors:", refErrors);
  }

  const resourceValidation = validateStateChanges(state, resourceChanges);
  if (resourceValidation.warnings.length > 0) {
    console.warn("Resource validation warnings:", resourceValidation.warnings);
  }
  applyChanges(newState, resourceValidation.clampedChanges);

  // Get world state updates via dedicated LLM call
  let worldChanges: StateChange[] = [];
  try {
    worldChanges = await getLLMWorldUpdate(
      state,
      playerChoice,
      actorResponses,
      resourceValidation.clampedChanges
    );
  } catch (error) {
    console.warn("World update LLM call failed:", error);
  }

  const worldValidation = validateStateChanges(newState, worldChanges);
  if (worldValidation.warnings.length > 0) {
    console.warn("World validation warnings:", worldValidation.warnings);
  }
  applyChanges(newState, worldValidation.clampedChanges);

  // Decrement countdown variables
  const countdownChanges: StateChange[] = [];
  const countdown = newState.worldVariables.find(
    (v) =>
      v.name.toLowerCase().includes("turns until") ||
      v.name.toLowerCase().includes("countdown")
  );
  if (countdown && countdown.type === "number") {
    const val = parseInt(countdown.value);
    if (!isNaN(val) && val > 0) {
      const oldVal = countdown.value;
      countdown.value = String(val - 1);
      countdownChanges.push({
        type: "worldVariable",
        target: countdown.name,
        field: "value",
        oldValue: oldVal,
        newValue: countdown.value,
        reason: "Turn countdown",
      });
    }
  }

  const allChanges = [
    ...resourceValidation.clampedChanges,
    ...worldValidation.clampedChanges,
    ...countdownChanges,
  ];

  const events = generateEvents(state, playerChoice, actorResponses, allChanges);
  newState.eventHistory = [...state.eventHistory, ...events];

  return {
    turn: newState.turn,
    playerChoice: { id: playerChoice.id, text: playerChoice.text },
    stateChanges: allChanges,
    events,
    actorResponses,
    newState,
  };
}

/**
 * Generate a page for the given turn result.
 */
export async function generatePage(
  turnResult: TurnResult,
  previousState: ScenarioState,
  previousChoices?: Choice[]
): Promise<PageData> {
  const { newState, playerChoice, actorResponses, stateChanges, resolverSummary } =
    turnResult;

  // Get structured narrative via LLM
  const narrative = await getLLMNarrative(
    previousState,
    playerChoice,
    actorResponses,
    stateChanges,
    resolverSummary
  );

  // Get choices via LLM
  const choices = await getLLMChoices(newState, playerChoice, previousChoices);

  const title = generateTitle(turnResult.events, playerChoice);
  const stateSummary = buildStateSummary(newState);

  return {
    title,
    narrative,
    stateSummary,
    choices,
  };
}

/**
 * Generate the initial page for turn 0 (game start).
 */
export async function generateInitialPage(
  state: ScenarioState
): Promise<PageData> {
  return getLLMInitialPage(state);
}

// --- Internal helpers ---

function generateEventsFromResolver(
  previousState: ScenarioState,
  playerChoice: Choice,
  actorResponses: { actorName: string; action: string }[],
  resolverResult: ResolverResult,
  stateChanges: StateChange[]
): GameEvent[] {
  const events: GameEvent[] = [];
  const turn = previousState.turn + 1;

  const choiceType = inferEventType(playerChoice.text);
  events.push({
    id: `event_${turn}_player`,
    turn,
    type: choiceType,
    description: `You decided to ${playerChoice.text.toLowerCase()}.`,
    involvedActors: [previousState.actors.find((a) => a.isPlayer)?.id ?? ""],
  });

  for (const response of actorResponses) {
    events.push({
      id: `event_${turn}_${response.actorName.replace(/\s+/g, "_").toLowerCase()}`,
      turn,
      type: inferEventType(response.action),
      description: response.action,
      involvedActors: [response.actorName],
    });
  }

  // Events from resolved effect types
  for (const resolution of resolverResult.resolutions) {
    const { effect } = resolution;
    if (effect.intensity === "major" || effect.intensity === "moderate") {
      events.push({
        id: `event_${turn}_effect_${effect.type}`.toLowerCase().replace(/\s+/g, "_"),
        turn,
        type: effect.type,
        description: `${effect.type.replace(/_/g, " ")} (${effect.intensity})${effect.target ? ` affecting ${effect.target}` : ""}`,
        involvedActors: effect.target ? [effect.target] : [],
      });
    }
  }

  // Significant numeric shifts (same threshold as legacy)
  const significantChanges = stateChanges.filter((c) => {
    if (c.type !== "resource") return false;
    const delta =
      typeof c.newValue === "number" && typeof c.oldValue === "number"
        ? Math.abs(c.newValue - c.oldValue)
        : 0;
    return delta >= 20;
  });

  for (const change of significantChanges) {
    events.push({
      id: `event_${turn}_change_${change.target}_${change.field}`
        .toLowerCase()
        .replace(/\s+/g, "_"),
      turn,
      type: "resource_shift",
      description: `${change.target}'s ${change.field} changed significantly: ${change.oldValue} → ${change.newValue}`,
      involvedActors: [change.target],
    });
  }

  return events;
}

function generateEvents(
  _previousState: ScenarioState,
  playerChoice: Choice,
  actorResponses: { actorName: string; action: string }[],
  stateChanges: StateChange[]
): GameEvent[] {
  const events: GameEvent[] = [];
  const turn = _previousState.turn + 1;

  const choiceType = inferEventType(playerChoice.text);
  events.push({
    id: `event_${turn}_player`,
    turn,
    type: choiceType,
    description: `You decided to ${playerChoice.text.toLowerCase()}.`,
    involvedActors: [_previousState.actors.find((a) => a.isPlayer)?.id ?? ""],
  });

  for (const response of actorResponses) {
    events.push({
      id: `event_${turn}_${response.actorName.replace(/\s+/g, "_").toLowerCase()}`,
      turn,
      type: inferEventType(response.action),
      description: response.action,
      involvedActors: [response.actorName],
    });
  }

  const significantChanges = stateChanges.filter((c) => {
    if (c.type !== "resource") return false;
    const delta =
      typeof c.newValue === "number" && typeof c.oldValue === "number"
        ? Math.abs(c.newValue - c.oldValue)
        : 0;
    return delta >= 20;
  });

  for (const change of significantChanges) {
    events.push({
      id: `event_${turn}_change_${change.target}_${change.field}`
        .toLowerCase()
        .replace(/\s+/g, "_"),
      turn,
      type: "resource_shift",
      description: `${change.target}'s ${change.field} changed significantly: ${change.oldValue} → ${change.newValue}`,
      involvedActors: [change.target],
    });
  }

  return events;
}

function inferEventType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("negotiate") || lower.includes("diplomat") || lower.includes("talk")) return "negotiation";
  if (lower.includes("trade") || lower.includes("offer") || lower.includes("exchange")) return "trade";
  if (lower.includes("attack") || lower.includes("pressure") || lower.includes("mobiliz")) return "conflict";
  if (lower.includes("fortify") || lower.includes("defend") || lower.includes("secure")) return "defense";
  if (lower.includes("intel") || lower.includes("scout") || lower.includes("spy")) return "intelligence";
  return "action";
}

function generateTitle(
  events: GameEvent[],
  playerChoice: { text: string }
): string {
  const type = inferEventType(playerChoice.text);
  const titles: Record<string, string[]> = {
    negotiation: ["Diplomatic Moves", "Words Over Swords", "A Careful Dance"],
    trade: ["An Exchange of Goods", "The Deal", "Markets in Motion"],
    conflict: ["Swords Are Drawn", "Rising Tensions", "The Cost of Aggression"],
    defense: ["Behind the Walls", "A Fortress Stance", "Bracing for Impact"],
    intelligence: ["Eyes and Ears", "Hidden Knowledge", "Shadows Move"],
    action: ["The Wheels Turn", "A New Development", "Shifting Sands"],
  };

  const options = titles[type] || titles.action;
  return options[events.length % options.length];
}
