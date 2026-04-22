import {
  buildOperationsFromDrafts,
  createEmptyOperationDraft,
  parseOperationDrafts,
  type OperationDraft,
} from "./operation-editor";
import type {
  EffectDefinition,
  EffectIntensity,
  EffectParameterDefinition,
  FieldDefinition,
} from "./types";

export interface EffectParameterDraft {
  name: string;
  type: EffectParameterDefinition["type"];
  objectType: string;
  required: boolean;
}

export interface EffectDefinitionDraft {
  id: string;
  label: string;
  description: string;
  parameterDrafts: EffectParameterDraft[];
  intensityDrafts: Record<EffectIntensity, OperationDraft[]>;
}

export const EFFECT_INTENSITY_OPTIONS: EffectIntensity[] = [
  "minor",
  "moderate",
  "major",
];

export const EFFECT_PARAMETER_TYPE_OPTIONS: EffectParameterDefinition["type"][] = [
  "actor",
  "resource",
  "relationship",
  "worldVariable",
  "object",
];

export function createEmptyEffectDefinitionDraft(): EffectDefinitionDraft {
  return {
    id: "",
    label: "",
    description: "",
    parameterDrafts: [],
    intensityDrafts: {
      minor: [],
      moderate: [],
      major: [],
    },
  };
}

export function createEmptyEffectParameterDraft(): EffectParameterDraft {
  return {
    name: "",
    type: "actor",
    objectType: "",
    required: true,
  };
}

export function parseEffectDefinitionDrafts(raw: unknown): EffectDefinitionDraft[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (item): item is Partial<EffectDefinition> =>
        Boolean(item) && typeof item === "object"
    )
    .map((effect) => ({
      id: typeof effect.id === "string" ? effect.id : "",
      label: typeof effect.label === "string" ? effect.label : "",
      description:
        typeof effect.description === "string" ? effect.description : "",
      parameterDrafts: parseEffectParameterDrafts(effect.parameters),
      intensityDrafts: {
        minor: parseOperationDrafts(effect.intensities?.minor),
        moderate: parseOperationDrafts(effect.intensities?.moderate),
        major: parseOperationDrafts(effect.intensities?.major),
      },
    }));
}

export function buildEffectDefinitionsFromDrafts(
  drafts: EffectDefinitionDraft[],
  objectTypeFieldDefinitions: Record<string, Record<string, FieldDefinition>> = {},
  label = "Effect definitions"
): EffectDefinition[] {
  return drafts.map((draft, index) =>
    buildEffectDefinitionFromDraft(
      draft,
      objectTypeFieldDefinitions,
      `${label} row ${index + 1}`
    )
  );
}

function parseEffectParameterDrafts(
  raw: unknown
): EffectParameterDraft[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

  return Object.entries(raw).map(([name, parameter]) => {
    const value =
      parameter && typeof parameter === "object" && !Array.isArray(parameter)
        ? (parameter as Partial<EffectParameterDefinition>)
        : {};

    return {
      name,
      type: isEffectParameterType(value.type) ? value.type : "actor",
      objectType: typeof value.objectType === "string" ? value.objectType : "",
      required: value.required !== false,
    };
  });
}

function buildEffectDefinitionFromDraft(
  draft: EffectDefinitionDraft,
  objectTypeFieldDefinitions: Record<string, Record<string, FieldDefinition>>,
  label: string
): EffectDefinition {
  const parameters = Object.fromEntries(
    draft.parameterDrafts.map((parameterDraft, index) => [
      requireString(
        parameterDraft.name,
        `${label} parameter ${index + 1} name`
      ),
      {
        type: parameterDraft.type,
        ...(parameterDraft.type === "object" && parameterDraft.objectType.trim()
          ? { objectType: parameterDraft.objectType.trim() }
          : {}),
        ...(parameterDraft.required ? {} : { required: false }),
      } satisfies EffectParameterDefinition,
    ])
  );

  const intensities = Object.fromEntries(
    EFFECT_INTENSITY_OPTIONS.flatMap((intensity) => {
      const operationDrafts = draft.intensityDrafts[intensity];
      if (!operationDrafts || operationDrafts.length === 0) {
        return [];
      }

      return [
        [
          intensity,
          buildOperationsFromDrafts(
            operationDrafts,
            objectTypeFieldDefinitions,
            `${label} ${intensity} intensity operations`
          ),
        ],
      ];
    })
  ) as EffectDefinition["intensities"];

  if (Object.keys(intensities).length === 0) {
    throw new Error(`${label} must define at least one intensity.`);
  }

  return {
    id: requireString(draft.id, `${label} id`),
    label: requireString(draft.label, `${label} label`),
    description: requireString(draft.description, `${label} description`),
    ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    intensities,
  };
}

function requireString(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function isEffectParameterType(
  value: unknown
): value is EffectParameterDefinition["type"] {
  return EFFECT_PARAMETER_TYPE_OPTIONS.includes(
    value as EffectParameterDefinition["type"]
  );
}

export { createEmptyOperationDraft };
