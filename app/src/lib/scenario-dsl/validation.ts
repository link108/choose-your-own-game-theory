import type { ScenarioState } from "@/lib/types";
import { scenarioPackageSchema } from "./schema";
import type {
  FieldDefinition,
  OperationDefinition,
  ScenarioObject,
  ScenarioPackage,
  ScenarioPackageIssue,
  ScenarioPackageValidationResult,
} from "./types";

export interface ScenarioPackageValidationContext {
  actorIds?: string[];
  resourceIds?: string[];
  worldVariableIds?: string[];
  relationshipIds?: string[];
}

export function buildValidationContextFromState(
  state: ScenarioState
): ScenarioPackageValidationContext {
  return {
    actorIds: state.actors.map((actor) => actor.id),
    resourceIds: state.actors.flatMap((actor) =>
      actor.resources.map((resource) => resource.id)
    ),
    worldVariableIds: state.worldVariables.map((variable) => variable.id),
    relationshipIds: state.relationships.map((relationship) => relationship.id),
  };
}

export function validateScenarioPackage(
  raw: unknown,
  context: ScenarioPackageValidationContext = {}
): ScenarioPackageValidationResult {
  const parsed = scenarioPackageSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((issue) => ({
        severity: "error",
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const scenarioPackage = parsed.data as ScenarioPackage;
  const issues: ScenarioPackageIssue[] = [];

  validateUniqueIds(
    scenarioPackage.stateExtensions.objectTypes.map((type) => type.id),
    "stateExtensions.objectTypes",
    issues
  );
  validateUniqueIds(
    scenarioPackage.stateExtensions.objects.map((object) => object.id),
    "stateExtensions.objects",
    issues
  );
  validateUniqueIds(
    scenarioPackage.effectDefinitions.map((effect) => effect.id),
    "effectDefinitions",
    issues
  );
  validateUniqueIds(
    scenarioPackage.triggerRules?.map((rule) => rule.id) ?? [],
    "triggerRules",
    issues
  );

  const objectTypes = new Map(
    scenarioPackage.stateExtensions.objectTypes.map((type) => [type.id, type])
  );
  const objects = new Map(
    scenarioPackage.stateExtensions.objects.map((object) => [object.id, object])
  );
  const effects = new Set(
    scenarioPackage.effectDefinitions.map((effect) => effect.id)
  );

  for (const object of scenarioPackage.stateExtensions.objects) {
    const objectType = objectTypes.get(object.typeId);
    if (!objectType) {
      issues.push({
        severity: "error",
        path: `stateExtensions.objects.${object.id}.typeId`,
        message: `Unknown object type "${object.typeId}"`,
      });
      continue;
    }

    validateObjectFields(object, objectType.fields, issues);
  }

  for (const effect of scenarioPackage.effectDefinitions) {
    const parameterNames = new Set(Object.keys(effect.parameters ?? {}));
    for (const [name, parameter] of Object.entries(effect.parameters ?? {})) {
      if (parameter.type === "object" && parameter.objectType) {
        validateKnownId(
          parameter.objectType,
          objectTypes,
          `effectDefinitions.${effect.id}.parameters.${name}.objectType`,
          "object type",
          issues
        );
      }
    }

    for (const [intensity, operations] of Object.entries(effect.intensities)) {
      operations?.forEach((operation, index) =>
        validateOperation(operation, {
          path: `effectDefinitions.${effect.id}.intensities.${intensity}.${index}`,
          parameterNames,
          objects,
          context,
          issues,
        })
      );
    }
  }

  for (const capability of scenarioPackage.actorCapabilities ?? []) {
    validateContextId(
      capability.actorId,
      context.actorIds,
      `actorCapabilities.${capability.actorId}.actorId`,
      "actor",
      issues
    );
    for (const effectId of capability.effectIds) {
      if (!effects.has(effectId)) {
        issues.push({
          severity: "error",
          path: `actorCapabilities.${capability.actorId}.effectIds`,
          message: `Unknown effect "${effectId}"`,
        });
      }
    }
  }

  for (const effectId of scenarioPackage.choicePolicy.preferredEffectIds ?? []) {
    if (!effects.has(effectId)) {
      issues.push({
        severity: "error",
        path: "choicePolicy.preferredEffectIds",
        message: `Unknown effect "${effectId}"`,
      });
    }
  }

  for (const rule of scenarioPackage.triggerRules ?? []) {
    if (rule.when.worldVariable) {
      validateContextId(
        rule.when.worldVariable,
        context.worldVariableIds,
        `triggerRules.${rule.id}.when.worldVariable`,
        "world variable",
        issues
      );
    }
    if (rule.when.object) {
      validateKnownId(
        rule.when.object,
        objects,
        `triggerRules.${rule.id}.when.object`,
        "object",
        issues
      );
    }
    rule.operations.forEach((operation, index) =>
      validateOperation(operation, {
        path: `triggerRules.${rule.id}.operations.${index}`,
        parameterNames: new Set(),
        objects,
        context,
        issues,
      })
    );
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
    package: scenarioPackage,
  };
}

function validateUniqueIds(
  ids: string[],
  path: string,
  issues: ScenarioPackageIssue[]
) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({
        severity: "error",
        path,
        message: `Duplicate id "${id}"`,
      });
    }
    seen.add(id);
  }
}

function validateObjectFields(
  object: ScenarioObject,
  fieldDefinitions: Record<string, FieldDefinition>,
  issues: ScenarioPackageIssue[]
) {
  for (const [fieldId, field] of Object.entries(fieldDefinitions)) {
    const value = object.fields[fieldId] ?? field.defaultValue;
    if (value === undefined) {
      if (field.required) {
        issues.push({
          severity: "error",
          path: `stateExtensions.objects.${object.id}.fields.${fieldId}`,
          message: "Required field is missing",
        });
      }
      continue;
    }

    validateFieldValue(
      value,
      field,
      `stateExtensions.objects.${object.id}.fields.${fieldId}`,
      issues
    );
  }

  for (const fieldId of Object.keys(object.fields)) {
    if (!fieldDefinitions[fieldId]) {
      issues.push({
        severity: "warning",
        path: `stateExtensions.objects.${object.id}.fields.${fieldId}`,
        message: "Field is not defined by the object type",
      });
    }
  }
}

function validateFieldValue(
  value: string | number | boolean,
  field: FieldDefinition,
  path: string,
  issues: ScenarioPackageIssue[]
) {
  if (field.kind === "number") {
    if (typeof value !== "number") {
      issues.push({ severity: "error", path, message: "Expected a number" });
      return;
    }
    if (field.min !== undefined && value < field.min) {
      issues.push({ severity: "error", path, message: "Value is below min" });
    }
    if (field.max !== undefined && value > field.max) {
      issues.push({ severity: "error", path, message: "Value is above max" });
    }
  } else if (field.kind === "boolean" && typeof value !== "boolean") {
    issues.push({ severity: "error", path, message: "Expected a boolean" });
  } else if (field.kind === "string" && typeof value !== "string") {
    issues.push({ severity: "error", path, message: "Expected a string" });
  } else if (field.kind === "enum") {
    if (typeof value !== "string") {
      issues.push({ severity: "error", path, message: "Expected an enum string" });
    } else if (field.values && !field.values.includes(value)) {
      issues.push({
        severity: "error",
        path,
        message: `Value must be one of: ${field.values.join(", ")}`,
      });
    }
  }
}

function validateOperation(
  operation: OperationDefinition,
  options: {
    path: string;
    parameterNames: Set<string>;
    objects: Map<string, ScenarioObject>;
    context: ScenarioPackageValidationContext;
    issues: ScenarioPackageIssue[];
  }
) {
  const { path, parameterNames, objects, context, issues } = options;
  switch (operation.op) {
    case "adjustActorResource":
    case "setActorResource":
      validateReference(
        operation.actor,
        parameterNames,
        context.actorIds,
        `${path}.actor`,
        "actor",
        issues
      );
      validateReference(
        operation.resource,
        parameterNames,
        context.resourceIds,
        `${path}.resource`,
        "resource",
        issues
      );
      break;
    case "adjustRelationship":
    case "setRelationshipType":
      validateReference(
        operation.relationship,
        parameterNames,
        context.relationshipIds,
        `${path}.relationship`,
        "relationship",
        issues
      );
      break;
    case "adjustWorldVariable":
    case "setWorldVariable":
      validateReference(
        operation.variable,
        parameterNames,
        context.worldVariableIds,
        `${path}.variable`,
        "world variable",
        issues
      );
      break;
    case "setObjectField":
    case "adjustObjectField":
      validateReference(
        operation.object,
        parameterNames,
        [...objects.keys()],
        `${path}.object`,
        "object",
        issues
      );
      break;
    case "createObject":
      if (objects.has(operation.object.id)) {
        issues.push({
          severity: "error",
          path: `${path}.object.id`,
          message: `Object "${operation.object.id}" already exists`,
        });
      }
      break;
    case "archiveObject":
    case "revealObject":
    case "hideObject":
      validateReference(
        operation.object,
        parameterNames,
        [...objects.keys()],
        `${path}.object`,
        "object",
        issues
      );
      break;
    case "addEvent":
      for (const actorId of operation.involvedActors ?? []) {
        validateReference(
          actorId,
          parameterNames,
          context.actorIds,
          `${path}.involvedActors`,
          "actor",
          issues
        );
      }
      break;
  }
}

function validateReference(
  value: string,
  parameterNames: Set<string>,
  knownIds: string[] | undefined,
  path: string,
  label: string,
  issues: ScenarioPackageIssue[]
) {
  if (isParameterReference(value)) {
    const parameterName = value.slice(1);
    if (!parameterNames.has(parameterName)) {
      issues.push({
        severity: "error",
        path,
        message: `Unknown parameter reference "${value}"`,
      });
    }
    return;
  }

  validateContextId(value, knownIds, path, label, issues);
}

function validateContextId(
  id: string,
  knownIds: string[] | undefined,
  path: string,
  label: string,
  issues: ScenarioPackageIssue[]
) {
  if (knownIds && knownIds.length > 0 && !knownIds.includes(id)) {
    issues.push({
      severity: "error",
      path,
      message: `Unknown ${label} "${id}"`,
    });
  }
}

function validateKnownId<T>(
  id: string,
  known: Map<string, T>,
  path: string,
  label: string,
  issues: ScenarioPackageIssue[]
) {
  if (!known.has(id)) {
    issues.push({
      severity: "error",
      path,
      message: `Unknown ${label} "${id}"`,
    });
  }
}

function isParameterReference(value: string): boolean {
  return value.startsWith("$") && value.length > 1;
}
