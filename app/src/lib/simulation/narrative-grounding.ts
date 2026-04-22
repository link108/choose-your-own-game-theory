import type {
  GameEvent,
  PageData,
  ResolverSummary,
  ScenarioState,
  StateChange,
  TurnResult,
} from "@/lib/types";
import { buildStateSummary } from "./state";

export interface NarrationActorAction {
  actorName: string;
  action: string;
}

export interface NarrationStateChange {
  type: StateChange["type"];
  target: string;
  field: string;
  oldValue: number | string;
  newValue: number | string;
  reason: string;
}

export interface NarrationGrounding {
  playerChoice: { text: string };
  actorActions: NarrationActorAction[];
  visibleStateChanges: NarrationStateChange[];
  visibleEvents: GameEvent[];
  stateSummary: PageData["stateSummary"];
  resolverSummary?: ResolverSummary;
}

export function buildNarrationGrounding(
  previousState: ScenarioState,
  turnResult: TurnResult
): NarrationGrounding {
  const stateSummary = buildStateSummary(turnResult.newState, previousState);

  return {
    playerChoice: turnResult.playerChoice,
    actorActions: turnResult.actorResponses
      .map((response) => ({
        actorName: response.actorName,
        action: response.action.trim(),
      }))
      .filter((response) => response.action.length > 0),
    visibleStateChanges: turnResult.stateChanges.filter((change) =>
      isNarratableStateChange(change, previousState, turnResult.newState)
    ),
    visibleEvents: turnResult.events.filter(isNarratableEvent),
    stateSummary,
    resolverSummary: turnResult.resolverSummary,
  };
}

export function buildGroundedPageTitle(grounding: NarrationGrounding): string {
  const revealChange = grounding.visibleStateChanges.find(
    (change) =>
      change.type === "scenarioObject" &&
      change.field === "visibility" &&
      String(change.newValue) === "revealed"
  );
  if (revealChange) return `${revealChange.target} Revealed`;

  const createdChange = grounding.visibleStateChanges.find(
    (change) =>
      change.type === "scenarioObject" && change.field === "created"
  );
  if (createdChange) return `${createdChange.target} Emerges`;

  const objectFieldChange = grounding.visibleStateChanges.find(
    (change) =>
      change.type === "scenarioObject" &&
      change.field !== "created" &&
      change.field !== "visibility"
  );
  if (objectFieldChange) return `${objectFieldChange.target} Changes`;

  const worldChange = grounding.visibleStateChanges.find(
    (change) => change.type === "worldVariable"
  );
  if (worldChange) return `${worldChange.target} Shifts`;

  const relationshipChange = grounding.visibleStateChanges.find(
    (change) => change.type === "relationship"
  );
  if (relationshipChange) return "Relations Shift";

  const resourceChange = grounding.visibleStateChanges.find(
    (change) => change.type === "resource"
  );
  if (resourceChange) return "Resources Rebalanced";

  const majorEvent = grounding.visibleEvents.find(
    (event) => event.type !== "resource_shift" && event.type !== "action"
  );
  if (majorEvent) return formatEventTypeAsTitle(majorEvent.type);

  if (grounding.visibleEvents.length > 0) {
    return formatEventTypeAsTitle(grounding.visibleEvents[0].type);
  }

  return "Consequences Unfold";
}

function isNarratableEvent(event: GameEvent): boolean {
  if (event.type === "trigger_rule") return false;
  if (event.description.startsWith("Trigger rule fired:")) return false;
  return true;
}

function isNarratableStateChange(
  change: StateChange,
  previousState: ScenarioState,
  newState: ScenarioState
): boolean {
  if (change.type !== "scenarioObject") return true;

  const previousObject = previousState.scenarioObjects?.find(
    (object) => object.name === change.target
  );
  const nextObject = newState.scenarioObjects?.find(
    (object) => object.name === change.target
  );
  const wasVisible = previousObject ? previousObject.visibility !== "hidden" : false;
  const isVisible = nextObject ? nextObject.visibility !== "hidden" : false;

  if (change.field === "visibility") {
    return wasVisible || isVisible;
  }

  if (change.field === "created") {
    return isVisible;
  }

  if (!wasVisible && !isVisible) {
    return false;
  }

  const objectType =
    (nextObject ? findObjectType(newState, nextObject.typeId) : undefined) ??
    (previousObject ? findObjectType(previousState, previousObject.typeId) : undefined);
  const field = objectType?.fields[change.field];
  return field?.visible !== false;
}

function findObjectType(state: ScenarioState, typeId: string) {
  return state.scenarioObjectTypes?.find((type) => type.id === typeId);
}

function formatEventTypeAsTitle(type: string): string {
  return type
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
