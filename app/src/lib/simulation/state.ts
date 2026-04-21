import type {
  ScenarioState,
  StateChange,
  ResourceState,
  VisibleStateChange,
} from "@/lib/types";

import type { ResourceDelta } from "./resolver";

/**
 * Deep clone a ScenarioState for speculative resolution.
 */
export function cloneState(state: ScenarioState): ScenarioState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Apply validated state changes to a state object (mutates in place).
 */
export function applyChanges(
  state: ScenarioState,
  changes: StateChange[]
): void {
  for (const change of changes) {
    switch (change.type) {
      case "resource": {
        const actor = state.actors.find((a) => a.name === change.target);
        if (!actor) continue;
        const resource = actor.resources.find((r) => r.name === change.field);
        if (!resource) continue;
        resource.value = typeof change.newValue === "number"
          ? change.newValue
          : parseInt(String(change.newValue)) || resource.value;
        break;
      }
      case "relationship": {
        const rel = state.relationships.find(
          (r) =>
            (r.fromActorId === change.target || getActorName(state, r.fromActorId) === change.target) &&
            r.id === change.field
        );
        if (rel && typeof change.newValue === "number") {
          rel.strength = change.newValue;
        }
        // Also handle field-based lookup for strength changes
        const relByNames = state.relationships.find((r) => {
          const fromName = getActorName(state, r.fromActorId);
          return fromName === change.target;
        });
        if (relByNames && change.field === "strength" && typeof change.newValue === "number") {
          relByNames.strength = change.newValue;
        }
        break;
      }
      case "worldVariable": {
        const variable = state.worldVariables.find(
          (v) => v.name === change.target
        );
        if (!variable) continue;
        variable.value = String(change.newValue);
        break;
      }
    }
  }
}

/**
 * Apply a single resolver ResourceDelta to the state (mutates in place).
 * Returns a StateChange for TurnResult backward compatibility, or null if the
 * target field could not be found.
 */
export function applyDelta(
  state: ScenarioState,
  delta: ResourceDelta
): StateChange | null {
  if (delta.actorId !== undefined) {
    const actor = state.actors.find((a) => a.id === delta.actorId);
    if (!actor) return null;
    const resource = actor.resources.find((r) => r.name === delta.field);
    if (!resource) return null;
    const oldValue = resource.value;
    resource.value = Math.round(delta.finalValue);
    return {
      type: "resource",
      target: actor.name,
      field: delta.field,
      oldValue,
      newValue: resource.value,
      reason: delta.reason,
    };
  } else {
    const variable = state.worldVariables.find((v) => v.name === delta.field);
    if (!variable) return null;
    const oldValue = variable.value;
    variable.value = String(Math.round(delta.finalValue));
    return {
      type: "worldVariable",
      target: delta.field,
      field: "value",
      oldValue,
      newValue: delta.finalValue,
      reason: delta.reason,
    };
  }
}

/**
 * Diff two states to produce a list of what changed.
 */
export function diffStates(
  before: ScenarioState,
  after: ScenarioState
): StateChange[] {
  const changes: StateChange[] = [];

  // Diff resources
  for (const afterActor of after.actors) {
    const beforeActor = before.actors.find((a) => a.id === afterActor.id);
    if (!beforeActor) continue;

    for (const afterRes of afterActor.resources) {
      const beforeRes = beforeActor.resources.find(
        (r) => r.id === afterRes.id
      );
      if (!beforeRes) continue;
      if (beforeRes.value !== afterRes.value) {
        changes.push({
          type: "resource",
          target: afterActor.name,
          field: afterRes.name,
          oldValue: beforeRes.value,
          newValue: afterRes.value,
          reason: "State change",
        });
      }
    }
  }

  // Diff relationships
  for (const afterRel of after.relationships) {
    const beforeRel = before.relationships.find((r) => r.id === afterRel.id);
    if (!beforeRel) continue;
    if (beforeRel.strength !== afterRel.strength) {
      changes.push({
        type: "relationship",
        target: getActorName(after, afterRel.fromActorId),
        field: "strength",
        oldValue: beforeRel.strength,
        newValue: afterRel.strength,
        reason: "Relationship changed",
      });
    }
  }

  // Diff world variables
  for (const afterVar of after.worldVariables) {
    const beforeVar = before.worldVariables.find((v) => v.id === afterVar.id);
    if (!beforeVar) continue;
    if (beforeVar.value !== afterVar.value) {
      changes.push({
        type: "worldVariable",
        target: afterVar.name,
        field: "value",
        oldValue: beforeVar.value,
        newValue: afterVar.value,
        reason: "World state changed",
      });
    }
  }

  return changes;
}

/**
 * Get actor name by ID from state.
 */
export function getActorName(state: ScenarioState, actorId: string): string {
  return state.actors.find((a) => a.id === actorId)?.name ?? "Unknown";
}

/**
 * Get the player actor from state.
 */
export function getPlayerActor(state: ScenarioState) {
  return state.actors.find((a) => a.isPlayer);
}

/**
 * Get non-player actors from state.
 */
export function getNonPlayerActors(state: ScenarioState) {
  return state.actors.filter((a) => !a.isPlayer);
}

/**
 * Build a state summary for the player (visible state only).
 */
export function buildStateSummary(
  state: ScenarioState,
  previousState?: ScenarioState
) {
  const player = getPlayerActor(state);
  if (!player) {
    return {
      playerResources: [] as ResourceState[],
      keyActors: [] as { name: string; status: string; relationship: string }[],
      activeTensions: [] as { text: string; change?: VisibleStateChange }[],
      worldState: [] as { name: string; value: string; kind: string; minValue: string | null; maxValue: string | null }[],
      scenarioObjects: [],
    };
  }

  const previousPlayer = previousState ? getPlayerActor(previousState) : undefined;
  const previousResourcesById = new Map(
    previousPlayer?.resources.map((resource) => [resource.id, resource]) ?? []
  );

  const keyActors = getNonPlayerActors(state).map((actor) => {
    const relToPlayer = state.relationships.find(
      (r) => r.fromActorId === actor.id && r.toActorId === player.id
    );
    const status = describeActorStatus(actor);
    const relationship = relToPlayer
      ? `${relToPlayer.type.replace("_", " ")} (${relToPlayer.strength})`
      : "unknown";
    const priorState = previousState;
    const previousActor = priorState?.actors.find((a) => a.id === actor.id);
    const previousPlayerActor = priorState ? getPlayerActor(priorState) : undefined;
    const previousRelToPlayer = previousActor && previousPlayerActor
      ? priorState?.relationships.find(
          (r) => r.fromActorId === previousActor.id && r.toActorId === previousPlayerActor.id
        )
      : undefined;
    const previousStatus = previousActor ? describeActorStatus(previousActor) : undefined;
    const previousRelationship = previousRelToPlayer
      ? `${previousRelToPlayer.type.replace("_", " ")} (${previousRelToPlayer.strength})`
      : previousActor
        ? "unknown"
        : undefined;
    const relationshipChange = previousRelToPlayer && relToPlayer && previousRelToPlayer.type === relToPlayer.type
      ? buildNumericChange(previousRelToPlayer.strength, relToPlayer.strength, "Relationship")
      : buildTextChange("Relationship", previousRelationship, relationship);
    const changes = [
      buildTextChange("Status", previousStatus, status),
      relationshipChange,
    ].filter((change): change is VisibleStateChange => change !== undefined);

    return {
      name: actor.name,
      status,
      relationship,
      ...(changes.length > 0 ? { changes } : {}),
    };
  });

  // Derive tensions from low relationship strengths or rival types
  const activeTensions = buildActiveTensions(state);
  const previousTensions = previousState
    ? buildActiveTensions(previousState)
    : [];
  const previousTensionSet = new Set(previousTensions);

  return {
    playerResources: player.resources.map((resource) => {
      const previousResource = previousResourcesById.get(resource.id);
      const change = previousResource
        ? buildNumericChange(previousResource.value, resource.value)
        : undefined;
      return {
        ...resource,
        ...(change ? { change } : {}),
      };
    }),
    keyActors,
    activeTensions: activeTensions.map((tension) => ({
      text: tension,
      ...(!previousTensionSet.has(tension)
        ? { change: buildTextChange(undefined, "none", tension) }
        : {}),
    })),
    worldState: state.worldVariables.map((v) => ({
      name: v.name,
      value: v.value,
      kind: v.kind,
      minValue: v.minValue,
      maxValue: v.maxValue,
      ...(() => {
        const previousVariable = previousState?.worldVariables.find(
          (previous) => previous.id === v.id
        );
        if (!previousVariable) return {};
        const change = buildWorldVariableChange(previousVariable.value, v.value, v.kind);
        return change ? { change } : {};
      })(),
    })),
    scenarioObjects: buildVisibleScenarioObjects(state),
  };
}

function buildVisibleScenarioObjects(state: ScenarioState) {
  const objectTypes = new Map(
    (state.scenarioObjectTypes ?? []).map((type) => [type.id, type])
  );

  return (state.scenarioObjects ?? [])
    .filter((object) => object.visibility !== "hidden")
    .map((object) => {
      const objectType = objectTypes.get(object.typeId);
      const visibleFields = Object.fromEntries(
        Object.entries(object.fields).filter(([fieldId]) => {
          const field = objectType?.fields[fieldId];
          return field?.visible !== false;
        })
      );

      return {
        id: object.id,
        typeId: object.typeId,
        typeLabel: objectType?.label ?? object.typeId,
        name: object.name,
        fields: visibleFields,
      };
    });
}

function buildActiveTensions(state: ScenarioState): string[] {
  const activeTensions: string[] = [];
  for (const rel of state.relationships) {
    if (rel.type === "rival" || rel.strength < 25) {
      const from = getActorName(state, rel.fromActorId);
      const to = getActorName(state, rel.toActorId);
      activeTensions.push(`Tension between ${from} and ${to}`);
    }
  }
  return activeTensions;
}

function buildNumericChange(
  previous: number,
  current: number,
  label?: string
): VisibleStateChange | undefined {
  const delta = current - previous;
  if (delta === 0) return undefined;
  return {
    kind: "numeric",
    label,
    previous,
    current,
    delta,
  };
}

function buildTextChange(
  label: string | undefined,
  previous: string | undefined,
  current: string
): VisibleStateChange | undefined {
  if (previous === undefined || previous === current) return undefined;
  return {
    kind: "text",
    label,
    previous,
    current,
  };
}

function buildWorldVariableChange(
  previous: string,
  current: string,
  kind: string
): VisibleStateChange | undefined {
  if (previous === current) return undefined;
  const previousNumber = Number(previous);
  const currentNumber = Number(current);
  const isNumeric =
    ["resource", "countdown", "counter"].includes(kind) &&
    Number.isFinite(previousNumber) &&
    Number.isFinite(currentNumber);

  if (isNumeric) {
    return buildNumericChange(previousNumber, currentNumber);
  }

  return buildTextChange(undefined, previous, current);
}

function describeActorStatus(actor: { resources: ResourceState[]; traits: string[] }): string {
  const lowResources = actor.resources.filter(
    (r) => r.value < r.maxValue * 0.2
  );
  if (lowResources.length > 0) {
    return `Low on ${lowResources.map((r) => r.name.toLowerCase()).join(", ")}`;
  }
  return "Stable";
}
