import type {
  EffectDefinition,
  FieldDefinition,
  ScenarioPackage,
  ScenarioPackageDiagnostic,
  ScenarioPackageDiagnosticsResult,
} from "./types";
import type { ScenarioPackageValidationContext } from "./validation";

export function diagnoseScenarioPackage(
  scenarioPackage: ScenarioPackage,
  context: ScenarioPackageValidationContext = {}
): ScenarioPackageDiagnosticsResult {
  const diagnostics: ScenarioPackageDiagnostic[] = [];
  const effectIds = new Set(
    scenarioPackage.effectDefinitions.map((effect) => effect.id)
  );
  const actorCapabilityMap = new Map(
    (scenarioPackage.actorCapabilities ?? []).map((capability) => [
      capability.actorId,
      capability.effectIds,
    ])
  );
  const referencedEffects = new Set(
    scenarioPackage.choicePolicy.preferredEffectIds ?? []
  );

  if (scenarioPackage.effectDefinitions.length === 0) {
    diagnostics.push({
      severity: "warning",
      code: "no_effect_definitions",
      path: "effectDefinitions",
      message:
        "The package defines no effects, so runtime choice generation has no reusable action vocabulary.",
      recommendation:
        "Add at least one effect definition that maps package choices to validated operations.",
    });
  }

  for (const effect of scenarioPackage.effectDefinitions) {
    const operationCount = countEffectOperations(effect);
    if (operationCount === 0) {
      diagnostics.push({
        severity: "warning",
        code: "effect_has_no_operations",
        path: `effectDefinitions.${effect.id}.intensities`,
        message: `Effect "${effect.id}" has no operations in any intensity.`,
        recommendation:
          "Add at least one operation so the effect can produce state changes.",
      });
    }
  }

  if (effectIds.size > 0 && (scenarioPackage.choicePolicy.preferredEffectIds?.length ?? 0) === 0) {
    diagnostics.push({
      severity: "warning",
      code: "choice_policy_has_no_preferred_effects",
      path: "choicePolicy.preferredEffectIds",
      message:
        "Choice policy does not highlight any preferred effects, which weakens guidance for package-backed choice generation.",
      recommendation:
        "List the most representative effect IDs so generated choices stay anchored to the package.",
    });
  }

  for (const effect of scenarioPackage.effectDefinitions) {
    let reachableByCapabilities = false;
    for (const effectIdsForActor of actorCapabilityMap.values()) {
      if (effectIdsForActor.includes(effect.id)) {
        reachableByCapabilities = true;
        referencedEffects.add(effect.id);
        break;
      }
    }

    if (!reachableByCapabilities && !referencedEffects.has(effect.id)) {
      diagnostics.push({
        severity: "warning",
        code: "effect_not_referenced_by_policy_or_capabilities",
        path: `effectDefinitions.${effect.id}`,
        message:
          `Effect "${effect.id}" is not referenced by actor capabilities or choice policy guidance.`,
        recommendation:
          "Either wire the effect into actor capabilities or add it to preferredEffectIds if it should influence generated choices.",
      });
    }
  }

  if ((context.actorIds?.length ?? 0) > 0 && effectIds.size > 0) {
    if ((scenarioPackage.actorCapabilities?.length ?? 0) === 0) {
      diagnostics.push({
        severity: "warning",
        code: "actor_capabilities_missing",
        path: "actorCapabilities",
        message:
          "No actor capabilities are defined, so actors fall back to an unrestricted effect set at runtime.",
        recommendation:
          "Add actor capability entries to constrain which package effects each actor should use.",
      });
    }

    for (const actorId of context.actorIds ?? []) {
      if (!actorCapabilityMap.has(actorId)) {
        diagnostics.push({
          severity: "warning",
          code: "actor_capability_missing_for_actor",
          path: `actorCapabilities.${actorId}`,
          message:
            `Actor "${actorId}" has no capability entry and will fall back to the package-wide effect list.`,
          recommendation:
            "Add a capability entry for this actor, even if it only allows a small subset of effects.",
        });
        continue;
      }

      if ((actorCapabilityMap.get(actorId) ?? []).length === 0) {
        diagnostics.push({
          severity: "warning",
          code: "actor_capability_has_no_effects",
          path: `actorCapabilities.${actorId}.effectIds`,
          message: `Actor "${actorId}" has a capability entry with no allowed effects.`,
          recommendation:
            "Assign at least one effect or remove the entry if the actor should use the unrestricted fallback.",
        });
      }
    }
  }

  for (const rule of scenarioPackage.triggerRules ?? []) {
    const hasConditionTarget = Boolean(rule.when.worldVariable || rule.when.object);
    const hasComparator =
      rule.when.equals !== undefined ||
      rule.when.lte !== undefined ||
      rule.when.gte !== undefined;

    if (!hasConditionTarget) {
      diagnostics.push({
        severity: "warning",
        code: "trigger_rule_has_no_target",
        path: `triggerRules.${rule.id}.when`,
        message:
          `Trigger rule "${rule.id}" has no world variable or object target and will never match.`,
        recommendation:
          "Define a worldVariable or object condition so the rule can activate.",
      });
    } else if (!hasComparator) {
      diagnostics.push({
        severity: "warning",
        code: "trigger_rule_has_no_comparator",
        path: `triggerRules.${rule.id}.when`,
        message:
          `Trigger rule "${rule.id}" does not specify equals, lte, or gte and will not activate.`,
        recommendation:
          "Add at least one comparison so the trigger has a concrete activation condition.",
      });
    }

    if (rule.when.object && !rule.when.field) {
      diagnostics.push({
        severity: "warning",
        code: "trigger_rule_object_missing_field",
        path: `triggerRules.${rule.id}.when.field`,
        message:
          `Trigger rule "${rule.id}" targets an object but does not specify a field to inspect.`,
        recommendation:
          "Set the field name that should be compared on the target object.",
      });
    }
  }

  for (const object of scenarioPackage.stateExtensions.objects) {
    const hidden = object.visibility !== "visible";
    if (!hidden) continue;

    const objectType = scenarioPackage.stateExtensions.objectTypes.find(
      (candidate) => candidate.id === object.typeId
    );
    const visibleFieldCount = countVisibleFields(objectType?.fields ?? {});

    if (visibleFieldCount === 0) {
      diagnostics.push({
        severity: "warning",
        code: "hidden_object_has_no_visible_fields",
        path: `stateExtensions.objects.${object.id}`,
        message:
          `Object "${object.id}" starts hidden and exposes no visible fields when revealed.`,
        recommendation:
          "Mark at least one field as visible or make the object visible from the start if players should learn about it.",
      });
    }
  }

  return {
    healthy: diagnostics.length === 0,
    diagnostics,
  };
}

function countEffectOperations(effect: EffectDefinition): number {
  return Object.values(effect.intensities).reduce(
    (total, operations) => total + (operations?.length ?? 0),
    0
  );
}

function countVisibleFields(fields: Record<string, FieldDefinition>): number {
  return Object.values(fields).filter((field) => field.visible !== false).length;
}
