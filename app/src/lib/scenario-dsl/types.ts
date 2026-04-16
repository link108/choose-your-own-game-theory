export const SCENARIO_PACKAGE_VERSION = 1 as const;

export type ScenarioPackageVersion = typeof SCENARIO_PACKAGE_VERSION;

export type FieldKind = "string" | "number" | "boolean" | "enum";

export interface FieldDefinition {
  kind: FieldKind;
  label?: string;
  required?: boolean;
  visible?: boolean;
  min?: number;
  max?: number;
  values?: string[];
  defaultValue?: string | number | boolean;
}

export interface ScenarioObjectType {
  id: string;
  label: string;
  description?: string;
  fields: Record<string, FieldDefinition>;
}

export type ScenarioObjectVisibility = "visible" | "hidden" | "revealed";

export interface ScenarioObject {
  id: string;
  typeId: string;
  name: string;
  fields: Record<string, string | number | boolean>;
  visibility: ScenarioObjectVisibility;
}

export interface ScenarioStateExtensions {
  objectTypes: ScenarioObjectType[];
  objects: ScenarioObject[];
}

export type OperationDefinition =
  | {
      op: "adjustActorResource";
      actor: string;
      resource: string;
      delta: number;
    }
  | {
      op: "setActorResource";
      actor: string;
      resource: string;
      value: number;
    }
  | {
      op: "adjustRelationship";
      relationship: string;
      delta: number;
    }
  | {
      op: "setRelationshipType";
      relationship: string;
      value: string;
    }
  | {
      op: "adjustWorldVariable";
      variable: string;
      delta: number;
    }
  | {
      op: "setWorldVariable";
      variable: string;
      value: string | number | boolean;
    }
  | {
      op: "setObjectField";
      object: string;
      field: string;
      value: string | number | boolean;
    }
  | {
      op: "adjustObjectField";
      object: string;
      field: string;
      delta: number;
    }
  | {
      op: "createObject";
      object: ScenarioObject;
    }
  | {
      op: "archiveObject";
      object: string;
    }
  | {
      op: "addEvent";
      eventType: string;
      description: string;
      involvedActors?: string[];
    }
  | {
      op: "revealObject";
      object: string;
    }
  | {
      op: "hideObject";
      object: string;
    };

export type EffectIntensity = "minor" | "moderate" | "major";

export interface EffectParameterDefinition {
  type: "actor" | "resource" | "relationship" | "worldVariable" | "object";
  objectType?: string;
  required?: boolean;
}

export interface EffectDefinition {
  id: string;
  label: string;
  description: string;
  parameters?: Record<string, EffectParameterDefinition>;
  intensities: Partial<Record<EffectIntensity, OperationDefinition[]>>;
}

export interface ActorCapability {
  actorId: string;
  effectIds: string[];
}

export interface TriggerRule {
  id: string;
  description?: string;
  once?: boolean;
  when: {
    worldVariable?: string;
    object?: string;
    field?: string;
    equals?: string | number | boolean;
    lte?: number;
    gte?: number;
  };
  operations: OperationDefinition[];
}

export interface ChoicePolicy {
  minChoices: number;
  maxChoices: number;
  guidance?: string;
  preferredEffectIds?: string[];
}

export interface VisibilityRule {
  id: string;
  description?: string;
}

export interface ScenarioPackage {
  version: ScenarioPackageVersion;
  metadata: {
    title: string;
    summary?: string;
  };
  stateExtensions: ScenarioStateExtensions;
  effectDefinitions: EffectDefinition[];
  actorCapabilities?: ActorCapability[];
  triggerRules?: TriggerRule[];
  choicePolicy: ChoicePolicy;
  visibilityRules?: VisibilityRule[];
}

export interface ScenarioPackageIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface ScenarioPackageValidationResult {
  valid: boolean;
  issues: ScenarioPackageIssue[];
  package?: ScenarioPackage;
}
