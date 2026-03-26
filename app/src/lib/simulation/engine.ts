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
  getStubActorResponses,
  getStubChoices,
  getStubInitialPage,
} from "./stub-actors";

/**
 * Resolve a single turn of the simulation.
 *
 * Pipeline:
 * 1. Validate player choice
 * 2. Get actor responses (stub or LLM)
 * 3. Collect + validate all state changes
 * 4. Apply changes to cloned state
 * 5. Generate events
 * 6. Return TurnResult
 */
export function resolveTurn(
  state: ScenarioState,
  playerChoice: Choice,
  availableChoices: Choice[]
): TurnResult {
  // 1. Validate player choice
  const isValidChoice = availableChoices.some((c) => c.id === playerChoice.id);
  if (!isValidChoice) {
    throw new Error(`Invalid choice: "${playerChoice.id}" is not available`);
  }

  // 2. Clone state for safe mutation
  const newState = cloneState(state);
  newState.turn = state.turn + 1;

  // 3. Get actor responses (stub for now — LLM will replace this)
  const actorResponses = getStubActorResponses(
    state,
    playerChoice
  );

  // 4. Collect all proposed state changes
  const allProposedChanges: StateChange[] = actorResponses.flatMap(
    (r) => r.proposedChanges
  );

  // 5. Validate entity references
  const refErrors = validateEntityReferences(state, allProposedChanges);
  if (refErrors.length > 0) {
    console.warn("Entity reference errors:", refErrors);
    // Filter out changes with invalid references
  }

  // 6. Validate and clamp state changes
  const validation = validateStateChanges(state, allProposedChanges);
  if (validation.warnings.length > 0) {
    console.warn("Validation warnings:", validation.warnings);
  }
  if (!validation.valid) {
    console.error("Validation errors:", validation.errors);
    // Continue with valid changes only
  }

  // 7. Apply validated changes
  applyChanges(newState, validation.clampedChanges);

  // 8. Decrement "Turns Until Winter" or similar countdown variables
  const countdown = newState.worldVariables.find(
    (v) => v.name.toLowerCase().includes("turns until") || v.name.toLowerCase().includes("countdown")
  );
  if (countdown && countdown.type === "number") {
    const val = parseInt(countdown.value);
    if (!isNaN(val) && val > 0) {
      const oldVal = countdown.value;
      countdown.value = String(val - 1);
      validation.clampedChanges.push({
        type: "worldVariable",
        target: countdown.name,
        field: "value",
        oldValue: oldVal,
        newValue: countdown.value,
        reason: "Turn countdown",
      });
    }
  }

  // 9. Generate events
  const events = generateEvents(
    state,
    playerChoice,
    actorResponses,
    validation.clampedChanges
  );
  newState.eventHistory = [...state.eventHistory, ...events];

  return {
    turn: newState.turn,
    playerChoice: { id: playerChoice.id, text: playerChoice.text },
    stateChanges: validation.clampedChanges,
    events,
    actorResponses,
    newState,
  };
}

/**
 * Generate a page for the given turn result.
 * In the stub implementation, this produces a basic narrative.
 * LLM integration will replace the narrative generation.
 */
export function generatePage(
  turnResult: TurnResult,
  previousState: ScenarioState
): PageData {
  const { newState, playerChoice, actorResponses, stateChanges, events } =
    turnResult;

  // Build narrative from actor responses and events
  const narrativeParts: string[] = [];

  narrativeParts.push(`**Turn ${turnResult.turn}** — You chose: *${playerChoice.text}*`);
  narrativeParts.push("");

  for (const response of actorResponses) {
    narrativeParts.push(response.action);
  }

  if (events.length > 0) {
    narrativeParts.push("");
    for (const event of events) {
      narrativeParts.push(`*${event.description}*`);
    }
  }

  // Summarize resource changes
  const resourceChanges = stateChanges.filter((c) => c.type === "resource");
  if (resourceChanges.length > 0) {
    narrativeParts.push("");
    narrativeParts.push("**Changes:**");
    for (const change of resourceChanges) {
      const delta =
        typeof change.newValue === "number" && typeof change.oldValue === "number"
          ? change.newValue - change.oldValue
          : null;
      const arrow = delta !== null ? (delta > 0 ? "+" : "") + delta : `→ ${change.newValue}`;
      narrativeParts.push(`- ${change.target}'s ${change.field}: ${arrow} (${change.reason})`);
    }
  }

  const title = generateTitle(events, playerChoice);
  const choices = getStubChoices(newState);
  const stateSummary = buildStateSummary(newState);

  return {
    title,
    narrative: narrativeParts.join("\n"),
    stateSummary,
    choices,
  };
}

/**
 * Generate the initial page for turn 0 (game start).
 */
export function generateInitialPage(state: ScenarioState): PageData {
  const stub = getStubInitialPage(state);
  const stateSummary = buildStateSummary(state);

  return {
    title: stub.title,
    narrative: stub.narrative,
    stateSummary,
    choices: stub.choices,
  };
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

  // Create an event for the player's action
  const choiceType = inferEventType(playerChoice.text);
  events.push({
    id: `event_${turn}_player`,
    turn,
    type: choiceType,
    description: `You decided to ${playerChoice.text.toLowerCase()}.`,
    involvedActors: [_previousState.actors.find((a) => a.isPlayer)?.id ?? ""],
  });

  // Create events for significant actor responses
  for (const response of actorResponses) {
    events.push({
      id: `event_${turn}_${response.actorName.replace(/\s+/g, "_").toLowerCase()}`,
      turn,
      type: inferEventType(response.action),
      description: response.action,
      involvedActors: [response.actorName],
    });
  }

  // Create events for significant resource changes
  const significantChanges = stateChanges.filter((c) => {
    if (c.type !== "resource") return false;
    const delta =
      typeof c.newValue === "number" && typeof c.oldValue === "number"
        ? Math.abs(c.newValue - c.oldValue)
        : 0;
    return delta >= 20; // Only flag big changes
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
  if (lower.includes("negotiate") || lower.includes("diplomat") || lower.includes("talk")) {
    return "negotiation";
  }
  if (lower.includes("trade") || lower.includes("offer") || lower.includes("exchange")) {
    return "trade";
  }
  if (lower.includes("attack") || lower.includes("pressure") || lower.includes("mobiliz")) {
    return "conflict";
  }
  if (lower.includes("fortify") || lower.includes("defend") || lower.includes("secure")) {
    return "defense";
  }
  if (lower.includes("intel") || lower.includes("scout") || lower.includes("spy")) {
    return "intelligence";
  }
  return "action";
}

/**
 * Generate a title for the turn based on events.
 */
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
  // Deterministic pick based on event count
  return options[events.length % options.length];
}
