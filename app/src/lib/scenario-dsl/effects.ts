import type { ScenarioState } from "@/lib/types";
import type {
  EffectDefinition,
  EffectParameterDefinition,
  OperationDefinition,
  ScenarioEffectInvocation,
  ScenarioObject,
  ScenarioPackage,
} from "./types";

export interface ScenarioEffectExpansionResult {
  operations: OperationDefinition[];
  rejected?: string;
}

export function expandScenarioEffect(
  state: ScenarioState,
  scenarioPackage: ScenarioPackage,
  invocation: ScenarioEffectInvocation
): ScenarioEffectExpansionResult {
  const effect = scenarioPackage.effectDefinitions.find(
    (item) => item.id === invocation.effectId
  );
  if (!effect) {
    return { operations: [], rejected: `Effect not found: ${invocation.effectId}` };
  }

  const operations = effect.intensities[invocation.intensity];
  if (!operations || operations.length === 0) {
    return {
      operations: [],
      rejected: `Effect "${invocation.effectId}" does not define intensity "${invocation.intensity}"`,
    };
  }

  const bindingValidation = validateBindings(state, effect, invocation.bindings);
  if (bindingValidation) {
    return { operations: [], rejected: bindingValidation };
  }

  try {
    return {
      operations: operations.map((operation) =>
        resolveOperationBindings(operation, invocation.bindings)
      ),
    };
  } catch (error) {
    return {
      operations: [],
      rejected:
        error instanceof Error ? error.message : "Failed to resolve effect bindings",
    };
  }
}

function validateBindings(
  state: ScenarioState,
  effect: EffectDefinition,
  bindings: Record<string, string>
): string | null {
  for (const [name, parameter] of Object.entries(effect.parameters ?? {})) {
    const value = bindings[name];
    if (!value) {
      if (parameter.required ?? true) {
        return `Missing required binding "${name}" for effect "${effect.id}"`;
      }
      continue;
    }

    const error = validateBindingValue(state, parameter, value);
    if (error) return error;
  }

  return null;
}

function validateBindingValue(
  state: ScenarioState,
  parameter: EffectParameterDefinition,
  value: string
): string | null {
  switch (parameter.type) {
    case "actor":
      return state.actors.some((item) => item.id === value)
        ? null
        : `Actor binding not found: ${value}`;
    case "resource":
      return state.actors.some((actor) =>
        actor.resources.some((resource) => resource.id === value)
      )
        ? null
        : `Resource binding not found: ${value}`;
    case "relationship":
      return state.relationships.some((item) => item.id === value)
        ? null
        : `Relationship binding not found: ${value}`;
    case "worldVariable":
      return state.worldVariables.some((item) => item.id === value)
        ? null
        : `World variable binding not found: ${value}`;
    case "object": {
      const object = state.scenarioObjects?.find((item) => item.id === value);
      if (!object) return `Scenario object binding not found: ${value}`;
      if (parameter.objectType && object.typeId !== parameter.objectType) {
        return `Scenario object "${value}" must be of type "${parameter.objectType}"`;
      }
      return null;
    }
  }
}

function resolveOperationBindings(
  operation: OperationDefinition,
  bindings: Record<string, string>
): OperationDefinition {
  switch (operation.op) {
    case "adjustActorResource":
      return {
        ...operation,
        actor: resolveStringBinding(operation.actor, bindings),
        resource: resolveStringBinding(operation.resource, bindings),
      };
    case "setActorResource":
      return {
        ...operation,
        actor: resolveStringBinding(operation.actor, bindings),
        resource: resolveStringBinding(operation.resource, bindings),
      };
    case "adjustRelationship":
      return {
        ...operation,
        relationship: resolveStringBinding(operation.relationship, bindings),
      };
    case "setRelationshipType":
      return {
        ...operation,
        relationship: resolveStringBinding(operation.relationship, bindings),
      };
    case "adjustWorldVariable":
      return {
        ...operation,
        variable: resolveStringBinding(operation.variable, bindings),
      };
    case "setWorldVariable":
      return {
        ...operation,
        variable: resolveStringBinding(operation.variable, bindings),
        value:
          typeof operation.value === "string"
            ? resolveStringBinding(operation.value, bindings)
            : operation.value,
      };
    case "setObjectField":
      return {
        ...operation,
        object: resolveStringBinding(operation.object, bindings),
        value:
          typeof operation.value === "string"
            ? resolveStringBinding(operation.value, bindings)
            : operation.value,
      };
    case "adjustObjectField":
      return {
        ...operation,
        object: resolveStringBinding(operation.object, bindings),
      };
    case "createObject":
      return {
        ...operation,
        object: resolveObjectBindings(operation.object, bindings),
      };
    case "archiveObject":
    case "revealObject":
    case "hideObject":
      return {
        ...operation,
        object: resolveStringBinding(operation.object, bindings),
      };
    case "addEvent":
      return {
        ...operation,
        description: resolveTemplateString(operation.description, bindings),
        involvedActors: operation.involvedActors?.map((item) =>
          resolveStringBinding(item, bindings)
        ),
      };
  }
}

function resolveObjectBindings(
  object: ScenarioObject,
  bindings: Record<string, string>
): ScenarioObject {
  return {
    ...object,
    id: resolveTemplateString(object.id, bindings),
    typeId: resolveStringBinding(object.typeId, bindings),
    name: resolveTemplateString(object.name, bindings),
    fields: Object.fromEntries(
      Object.entries(object.fields).map(([key, value]) => [
        key,
        typeof value === "string" ? resolveStringBinding(value, bindings) : value,
      ])
    ),
  };
}

function resolveStringBinding(
  value: string,
  bindings: Record<string, string>
): string {
  if (!value.startsWith("$")) return resolveTemplateString(value, bindings);

  const bindingName = value.slice(1);
  const bindingValue = bindings[bindingName];
  if (!bindingValue) {
    throw new Error(`Missing binding value for "${bindingName}"`);
  }
  return bindingValue;
}

function resolveTemplateString(
  value: string,
  bindings: Record<string, string>
): string {
  return value.replace(/\$([a-zA-Z0-9_]+)/g, (_match, bindingName: string) => {
    const bindingValue = bindings[bindingName];
    if (!bindingValue) {
      throw new Error(`Missing binding value for "${bindingName}"`);
    }
    return bindingValue;
  });
}
