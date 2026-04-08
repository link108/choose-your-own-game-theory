import type {
  ScenarioState,
  StateChange,
  ResourceState,
} from "@/lib/types";

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
export function buildStateSummary(state: ScenarioState) {
  const player = getPlayerActor(state);
  if (!player) {
    return {
      playerResources: [] as ResourceState[],
      keyActors: [] as { name: string; status: string; relationship: string }[],
      activeTensions: [] as string[],
      worldState: [] as { name: string; value: string; type: string; minValue: string | null; maxValue: string | null }[],
    };
  }

  const keyActors = getNonPlayerActors(state).map((actor) => {
    const relToPlayer = state.relationships.find(
      (r) => r.fromActorId === actor.id && r.toActorId === player.id
    );
    return {
      name: actor.name,
      status: describeActorStatus(actor),
      relationship: relToPlayer
        ? `${relToPlayer.type.replace("_", " ")} (${relToPlayer.strength})`
        : "unknown",
    };
  });

  // Derive tensions from low relationship strengths or rival types
  const activeTensions: string[] = [];
  for (const rel of state.relationships) {
    if (rel.type === "rival" || rel.strength < 25) {
      const from = getActorName(state, rel.fromActorId);
      const to = getActorName(state, rel.toActorId);
      activeTensions.push(`Tension between ${from} and ${to}`);
    }
  }

  return {
    playerResources: player.resources,
    keyActors,
    activeTensions,
    worldState: state.worldVariables.map((v) => ({
      name: v.name,
      value: v.value,
      type: v.type,
      minValue: v.minValue,
      maxValue: v.maxValue,
    })),
  };
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
