import type { GameEvent, ScenarioState, StateChange } from "@/lib/types";
import type { OperationDefinition, ScenarioObject } from "./types";

export interface ScenarioOperationResolverResult {
  stateChanges: StateChange[];
  events: GameEvent[];
  appliedOperations: OperationDefinition[];
  rejectedOperations: Array<{ operation: OperationDefinition; reason: string }>;
}

export function applyScenarioOperations(
  state: ScenarioState,
  operations: OperationDefinition[],
  options?: {
    turn?: number;
    reason?: string;
  }
): ScenarioOperationResolverResult {
  const stateChanges: StateChange[] = [];
  const events: GameEvent[] = [];
  const appliedOperations: OperationDefinition[] = [];
  const rejectedOperations: Array<{
    operation: OperationDefinition;
    reason: string;
  }> = [];

  const turn = options?.turn ?? state.turn;
  const reason = options?.reason ?? "Scenario operation";

  for (const operation of operations) {
    const result = applySingleOperation(state, operation, turn, reason);
    if (!result.applied) {
      rejectedOperations.push({
        operation,
        reason: result.reason ?? "Operation could not be applied",
      });
      continue;
    }

    appliedOperations.push(operation);
    if (result.stateChange) stateChanges.push(result.stateChange);
    if (result.event) events.push(result.event);
  }

  if (events.length > 0) {
    state.eventHistory = [...state.eventHistory, ...events];
  }

  return {
    stateChanges,
    events,
    appliedOperations,
    rejectedOperations,
  };
}

function applySingleOperation(
  state: ScenarioState,
  operation: OperationDefinition,
  turn: number,
  reason: string
): {
  applied: boolean;
  reason?: string;
  stateChange?: StateChange;
  event?: GameEvent;
} {
  switch (operation.op) {
    case "adjustActorResource": {
      const actor = state.actors.find((item) => item.id === operation.actor);
      if (!actor) return { applied: false, reason: `Actor not found: ${operation.actor}` };

      const resource = actor.resources.find((item) => item.id === operation.resource);
      if (!resource) {
        return { applied: false, reason: `Resource not found: ${operation.resource}` };
      }

      const oldValue = resource.value;
      resource.value = clampNumber(
        resource.value + operation.delta,
        resource.minValue,
        resource.maxValue
      );

      return {
        applied: true,
        stateChange: {
          type: "resource",
          target: actor.name,
          field: resource.name,
          oldValue,
          newValue: resource.value,
          reason,
        },
      };
    }

    case "setActorResource": {
      const actor = state.actors.find((item) => item.id === operation.actor);
      if (!actor) return { applied: false, reason: `Actor not found: ${operation.actor}` };

      const resource = actor.resources.find((item) => item.id === operation.resource);
      if (!resource) {
        return { applied: false, reason: `Resource not found: ${operation.resource}` };
      }

      const oldValue = resource.value;
      resource.value = clampNumber(
        operation.value,
        resource.minValue,
        resource.maxValue
      );

      return {
        applied: true,
        stateChange: {
          type: "resource",
          target: actor.name,
          field: resource.name,
          oldValue,
          newValue: resource.value,
          reason,
        },
      };
    }

    case "adjustRelationship": {
      const relationship = state.relationships.find(
        (item) => item.id === operation.relationship
      );
      if (!relationship) {
        return {
          applied: false,
          reason: `Relationship not found: ${operation.relationship}`,
        };
      }

      const oldValue = relationship.strength;
      relationship.strength = clampNumber(
        relationship.strength + operation.delta,
        0,
        100
      );

      return {
        applied: true,
        stateChange: {
          type: "relationship",
          target: relationship.id,
          field: "strength",
          oldValue,
          newValue: relationship.strength,
          reason,
        },
      };
    }

    case "setRelationshipType": {
      const relationship = state.relationships.find(
        (item) => item.id === operation.relationship
      );
      if (!relationship) {
        return {
          applied: false,
          reason: `Relationship not found: ${operation.relationship}`,
        };
      }

      const oldValue = relationship.type;
      relationship.type = operation.value;

      return {
        applied: true,
        stateChange: {
          type: "relationship",
          target: relationship.id,
          field: "type",
          oldValue,
          newValue: relationship.type,
          reason,
        },
      };
    }

    case "adjustWorldVariable": {
      const variable = state.worldVariables.find(
        (item) => item.id === operation.variable
      );
      if (!variable) {
        return {
          applied: false,
          reason: `World variable not found: ${operation.variable}`,
        };
      }

      const currentValue = Number(variable.value);
      if (!Number.isFinite(currentValue)) {
        return {
          applied: false,
          reason: `World variable is not numeric: ${operation.variable}`,
        };
      }

      const minValue = variable.minValue !== null ? Number(variable.minValue) : undefined;
      const maxValue = variable.maxValue !== null ? Number(variable.maxValue) : undefined;
      const oldValue = variable.value;
      variable.value = String(
        clampNumber(currentValue + operation.delta, minValue, maxValue)
      );

      return {
        applied: true,
        stateChange: {
          type: "worldVariable",
          target: variable.name,
          field: "value",
          oldValue,
          newValue: variable.value,
          reason,
        },
      };
    }

    case "setWorldVariable": {
      const variable = state.worldVariables.find(
        (item) => item.id === operation.variable
      );
      if (!variable) {
        return {
          applied: false,
          reason: `World variable not found: ${operation.variable}`,
        };
      }

      const oldValue = variable.value;
      if (
        (variable.kind === "resource" ||
          variable.kind === "countdown" ||
          variable.kind === "counter") &&
        typeof operation.value === "number"
      ) {
        const minValue = variable.minValue !== null ? Number(variable.minValue) : undefined;
        const maxValue = variable.maxValue !== null ? Number(variable.maxValue) : undefined;
        variable.value = String(clampNumber(operation.value, minValue, maxValue));
      } else {
        variable.value = String(operation.value);
      }

      return {
        applied: true,
        stateChange: {
          type: "worldVariable",
          target: variable.name,
          field: "value",
          oldValue,
          newValue: variable.value,
          reason,
        },
      };
    }

    case "setObjectField": {
      const object = state.scenarioObjects?.find((item) => item.id === operation.object);
      if (!object) {
        return { applied: false, reason: `Scenario object not found: ${operation.object}` };
      }

      const oldValue = object.fields[operation.field];
      if (oldValue === undefined) {
        return {
          applied: false,
          reason: `Scenario object field not found: ${operation.field}`,
        };
      }
      object.fields[operation.field] = operation.value;

      return {
        applied: true,
        stateChange: {
          type: "scenarioObject",
          target: object.name,
          field: operation.field,
          oldValue: stringifyScalar(oldValue),
          newValue: stringifyScalar(operation.value),
          reason,
        },
      };
    }

    case "adjustObjectField": {
      const object = state.scenarioObjects?.find((item) => item.id === operation.object);
      if (!object) {
        return { applied: false, reason: `Scenario object not found: ${operation.object}` };
      }

      const currentValue = object.fields[operation.field];
      if (typeof currentValue !== "number") {
        return {
          applied: false,
          reason: `Scenario object field is not numeric: ${operation.field}`,
        };
      }

      const oldValue = currentValue;
      object.fields[operation.field] = currentValue + operation.delta;

      return {
        applied: true,
        stateChange: {
          type: "scenarioObject",
          target: object.name,
          field: operation.field,
          oldValue,
          newValue: object.fields[operation.field] as number,
          reason,
        },
      };
    }

    case "createObject": {
      if (!state.scenarioObjects) state.scenarioObjects = [];
      if (state.scenarioObjects.some((item) => item.id === operation.object.id)) {
        return {
          applied: false,
          reason: `Scenario object already exists: ${operation.object.id}`,
        };
      }

      const newObject: ScenarioObject = JSON.parse(
        JSON.stringify(operation.object)
      ) as ScenarioObject;
      state.scenarioObjects.push(newObject);

      return {
        applied: true,
        stateChange: {
          type: "scenarioObject",
          target: newObject.name,
          field: "created",
          oldValue: "none",
          newValue: newObject.typeId,
          reason,
        },
      };
    }

    case "archiveObject": {
      const beforeCount = state.scenarioObjects?.length ?? 0;
      state.scenarioObjects = (state.scenarioObjects ?? []).filter(
        (item) => item.id !== operation.object
      );
      if ((state.scenarioObjects?.length ?? 0) === beforeCount) {
        return {
          applied: false,
          reason: `Scenario object not found: ${operation.object}`,
        };
      }
      return { applied: true };
    }

    case "revealObject":
    case "hideObject": {
      const object = state.scenarioObjects?.find((item) => item.id === operation.object);
      if (!object) {
        return { applied: false, reason: `Scenario object not found: ${operation.object}` };
      }

      const oldValue = object.visibility;
      object.visibility = operation.op === "revealObject" ? "revealed" : "hidden";

      return {
        applied: true,
        stateChange: {
          type: "scenarioObject",
          target: object.name,
          field: "visibility",
          oldValue,
          newValue: object.visibility,
          reason,
        },
      };
    }

    case "addEvent": {
      const event: GameEvent = {
        id: `scenario_op_${turn}_${operation.eventType}_${state.eventHistory.length + 1}`
          .toLowerCase()
          .replace(/\s+/g, "_"),
        turn,
        type: operation.eventType,
        description: operation.description,
        involvedActors: operation.involvedActors ?? [],
      };

      return {
        applied: true,
        event,
      };
    }
  }
}

function clampNumber(value: number, min?: number, max?: number): number {
  let result = value;
  if (min !== undefined && Number.isFinite(min)) {
    result = Math.max(min, result);
  }
  if (max !== undefined && Number.isFinite(max)) {
    result = Math.min(max, result);
  }
  return result;
}

function stringifyScalar(value: string | number | boolean): string | number {
  return typeof value === "boolean" ? String(value) : value;
}
