import type {
  ScenarioState,
  TurnResult,
  Choice,
  StateChange,
  GameEvent,
  PageData,
} from "@/lib/types";
import { cloneState, applyChanges, buildStateSummary } from "./state";
import {
  validateStateChanges,
  validateEntityReferences,
} from "./validation";
import {
  getLLMActorResponses,
  getLLMWorldUpdate,
  getLLMNarrative,
  getLLMChoices,
  getLLMInitialPage,
} from "../llm/game-llm";

/**
 * Resolve a single turn of the simulation.
 *
 * Pipeline:
 * 1. Validate choice
 * 2. Get actor responses (LLM)
 * 3. Validate & apply resource changes
 * 4. Get world state updates (LLM) — separate call with full context
 * 5. Validate & apply world changes
 * 6. Generate events
 */
export async function resolveTurn(
  state: ScenarioState,
  playerChoice: Choice,
  availableChoices: Choice[]
): Promise<TurnResult> {
  // 1. Validate player choice
  const isValidChoice = availableChoices.some((c) => c.id === playerChoice.id);
  if (!isValidChoice) {
    throw new Error(`Invalid choice: "${playerChoice.id}" is not available`);
  }

  // 2. Clone state for safe mutation
  const newState = cloneState(state);
  newState.turn = state.turn + 1;

  // 3. Get actor responses via LLM
  const actorResponses = await getLLMActorResponses(state, playerChoice);

  // 4. Collect resource changes from actor responses
  const resourceChanges: StateChange[] = actorResponses
    .flatMap((r) => r.proposedChanges)
    .filter((c) => c.type === "resource");

  // 5. Validate and apply resource changes
  const refErrors = validateEntityReferences(state, resourceChanges);
  if (refErrors.length > 0) {
    console.warn("Entity reference errors:", refErrors);
  }

  const resourceValidation = validateStateChanges(state, resourceChanges);
  if (resourceValidation.warnings.length > 0) {
    console.warn("Resource validation warnings:", resourceValidation.warnings);
  }
  applyChanges(newState, resourceValidation.clampedChanges);

  // 6. Get world state updates via dedicated LLM call
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

  // 7. Validate and apply world changes
  const worldValidation = validateStateChanges(newState, worldChanges);
  if (worldValidation.warnings.length > 0) {
    console.warn("World validation warnings:", worldValidation.warnings);
  }
  applyChanges(newState, worldValidation.clampedChanges);

  // 8. Decrement countdown variables
  const countdownChanges: StateChange[] = [];
  const countdown = newState.worldVariables.find(
    (v) => v.name.toLowerCase().includes("turns until") || v.name.toLowerCase().includes("countdown")
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

  // 9. Combine all state changes
  const allChanges = [
    ...resourceValidation.clampedChanges,
    ...worldValidation.clampedChanges,
    ...countdownChanges,
  ];

  // 10. Generate events
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
  const { newState, playerChoice, actorResponses, stateChanges } = turnResult;

  // Get structured narrative via LLM
  const narrative = await getLLMNarrative(
    previousState,
    playerChoice,
    actorResponses,
    stateChanges
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
      id: `event_${turn}_change_${change.target}_${change.field}`.toLowerCase().replace(/\s+/g, "_"),
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
