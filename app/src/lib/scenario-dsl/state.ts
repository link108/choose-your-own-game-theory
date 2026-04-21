import type {
  ScenarioObject,
  ScenarioObjectType,
  ScenarioPackage,
} from "./types";

export interface ScenarioStateExtensionSnapshot {
  scenarioObjectTypes: ScenarioObjectType[];
  scenarioObjects: ScenarioObject[];
}

export function buildScenarioStateExtensions(
  scenarioPackage: ScenarioPackage | null | undefined
): ScenarioStateExtensionSnapshot {
  if (!scenarioPackage) {
    return {
      scenarioObjectTypes: [],
      scenarioObjects: [],
    };
  }

  return {
    scenarioObjectTypes: clone(scenarioPackage.stateExtensions.objectTypes),
    scenarioObjects: clone(scenarioPackage.stateExtensions.objects),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
