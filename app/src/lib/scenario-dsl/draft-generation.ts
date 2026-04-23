import { parseJSON } from "@/lib/llm/parse";
import { getLLMProvider, isLLMConfigured } from "@/lib/llm/provider";
import { diagnoseScenarioPackage } from "./diagnostics";
import {
  SCENARIO_PACKAGE_VERSION,
  type ScenarioPackageDiagnostic,
  type ScenarioPackageIssue,
} from "./types";
import {
  type ScenarioPackageValidationContext,
  validateScenarioPackage,
} from "./validation";

interface DraftGenerationActorContext {
  id: string;
  name: string;
  description: string;
  goals: string[];
  traits: string[];
  isPlayer: boolean;
  resources: Array<{
    id: string;
    name: string;
    value: number;
    minValue: number;
    maxValue: number;
  }>;
  relationshipsFrom: Array<{
    id: string;
    toActorId: string;
    toActorName?: string;
    type: string;
    strength: number;
    description?: string | null;
  }>;
}

interface DraftGenerationWorldVariableContext {
  id: string;
  name: string;
  kind: string;
  value: string;
  minValue?: string | null;
  maxValue?: string | null;
}

export interface ScenarioPackageDraftContext {
  scenario: {
    name: string;
    description: string;
    worldDescription: string;
    actors: DraftGenerationActorContext[];
    worldVariables: DraftGenerationWorldVariableContext[];
    existingPackage?: unknown | null;
  };
  authorPrompt: string;
  validationContext: ScenarioPackageValidationContext;
}

export interface ScenarioPackageDraftResult {
  draft: unknown | null;
  validation: {
    valid: boolean;
    issues: ScenarioPackageIssue[];
    diagnostics: ScenarioPackageDiagnostic[];
  };
  diagnostics: ScenarioPackageDiagnostic[];
  critique: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function buildScenarioPackageDraftPrompt(
  context: ScenarioPackageDraftContext
): { system: string; user: string } {
  const system = `You draft ScenarioPackage JSON for a structured simulation engine.

Output ONLY valid JSON. Do not wrap it in markdown fences.

Rules:
- This is a draft only. Do not describe actions outside the package JSON.
- The backend remains the source of truth. Your job is to propose a package draft, not mutate live state.
- Return a single JSON object that matches the ScenarioPackage structure exactly.
- Set "version" to ${SCENARIO_PACKAGE_VERSION}.
- Use only actor/resource/worldVariable/relationship IDs that appear in the provided scenario context.
- You may invent package-local ids for object types, objects, effects, trigger rules, and visibility rules when they are self-consistent.
- Keep the first draft lean and useful. Prefer a small, coherent package over an exhaustive one.
- Prefer 2-5 effect definitions unless the author prompt clearly needs more.
- Include choicePolicy with sensible defaults if the prompt does not specify them.
- Every effect reference in actorCapabilities and choicePolicy.preferredEffectIds must point to a defined effect.
- Trigger rules are optional; include them only when they clearly express ongoing world logic.

ScenarioPackage shape summary:
{
  "version": 1,
  "metadata": { "title": "string", "summary": "string?" },
  "stateExtensions": {
    "objectTypes": [
      {
        "id": "string",
        "label": "string",
        "description": "string?",
        "fields": {
          "field_id": {
            "kind": "string|number|boolean|enum",
            "label": "string?",
            "required": true,
            "visible": true,
            "min": 0,
            "max": 100,
            "values": ["enumValue"],
            "defaultValue": "scalar?"
          }
        }
      }
    ],
    "objects": [
      {
        "id": "string",
        "typeId": "string",
        "name": "string",
        "visibility": "visible|hidden|revealed",
        "fields": { "field_id": "scalar" }
      }
    ]
  },
  "effectDefinitions": [
    {
      "id": "string",
      "label": "string",
      "description": "string",
      "parameters": {
        "paramName": {
          "type": "actor|resource|relationship|worldVariable|object",
          "objectType": "string?",
          "required": true
        }
      },
      "intensities": {
        "minor": [operation],
        "moderate": [operation],
        "major": [operation]
      }
    }
  ],
  "actorCapabilities": [{ "actorId": "actor_id", "effectIds": ["effect_id"] }],
  "triggerRules": [
    {
      "id": "string",
      "description": "string?",
      "once": true,
      "when": {
        "worldVariable": "world_var_id?",
        "object": "object_id?",
        "field": "field_id?",
        "equals": "scalar?",
        "lte": 0,
        "gte": 0
      },
      "operations": [operation]
    }
  ],
  "choicePolicy": {
    "minChoices": 3,
    "maxChoices": 5,
    "guidance": "string?",
    "preferredEffectIds": ["effect_id"]
  },
  "visibilityRules": [{ "id": "string", "description": "string?" }]
}

Allowed operation shapes:
- {"op":"adjustActorResource","actor":"actor_id_or_$param","resource":"resource_id_or_$param","delta":number}
- {"op":"setActorResource","actor":"actor_id_or_$param","resource":"resource_id_or_$param","value":number}
- {"op":"adjustRelationship","relationship":"relationship_id_or_$param","delta":number}
- {"op":"setRelationshipType","relationship":"relationship_id_or_$param","value":"string"}
- {"op":"adjustWorldVariable","variable":"world_var_id_or_$param","delta":number}
- {"op":"setWorldVariable","variable":"world_var_id_or_$param","value":"scalar"}
- {"op":"setObjectField","object":"object_id_or_$param","field":"field_id","value":"scalar"}
- {"op":"adjustObjectField","object":"object_id_or_$param","field":"field_id","delta":number}
- {"op":"createObject","object":scenarioObject}
- {"op":"archiveObject","object":"object_id_or_$param"}
- {"op":"addEvent","eventType":"string","description":"string","involvedActors":["actor_id"]}
- {"op":"revealObject","object":"object_id_or_$param"}
- {"op":"hideObject","object":"object_id_or_$param"}`;

  const user = `Author prompt:
${context.authorPrompt.trim()}

Scenario context:
${JSON.stringify(
    {
      name: context.scenario.name,
      description: context.scenario.description,
      worldDescription: context.scenario.worldDescription,
      actors: context.scenario.actors,
      worldVariables: context.scenario.worldVariables,
      existingPackage: context.scenario.existingPackage ?? null,
    },
    null,
    2
  )}`;

  return { system, user };
}

export function buildScenarioPackageDraftCritique(
  issues: ScenarioPackageIssue[],
  diagnostics: ScenarioPackageDiagnostic[] = []
): string[] {
  if (issues.length === 0 && diagnostics.length === 0) {
    return ["Draft passed validation and diagnostics checks and is ready to apply."];
  }

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const critique: string[] = [];

  if (errors.length > 0) {
    critique.push(
      `Fix ${errors.length} validation error${errors.length === 1 ? "" : "s"} before applying this draft.`
    );
  }

  if (warnings.length > 0) {
    critique.push(
      `${warnings.length} warning${warnings.length === 1 ? "" : "s"} may still be worth cleaning up.`
    );
  }

  if (diagnostics.length > 0) {
    critique.push(
      `${diagnostics.length} package diagnostic${diagnostics.length === 1 ? "" : "s"} highlight likely runtime or authoring quality gaps.`
    );
  }

  for (const issue of issues.slice(0, 3)) {
    critique.push(`${issue.path || "scenarioPackage"}: ${issue.message}`);
  }

  for (const diagnostic of diagnostics.slice(0, Math.max(0, 3 - issues.length))) {
    critique.push(
      `${diagnostic.path || "scenarioPackage"}: ${diagnostic.message}`
    );
  }

  return critique;
}

export function finalizeScenarioPackageDraft(
  raw: string,
  validationContext: ScenarioPackageValidationContext
): ScenarioPackageDraftResult {
  let parsed: unknown;

  try {
    parsed = parseJSON<unknown>(raw);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse draft JSON";
    const issues: ScenarioPackageIssue[] = [
      {
        severity: "error",
        path: "scenarioPackage",
        message,
      },
    ];

    return {
      draft: null,
      validation: {
        valid: false,
        issues,
        diagnostics: [],
      },
      diagnostics: [],
      critique: buildScenarioPackageDraftCritique(issues),
    };
  }

  const validation = validateScenarioPackage(parsed, validationContext);
  const diagnostics = validation.package
    ? diagnoseScenarioPackage(validation.package, validationContext).diagnostics
    : [];
  return {
    draft: validation.package ?? (isRecord(parsed) ? parsed : null),
    validation: {
      valid: validation.valid,
      issues: validation.issues,
      diagnostics,
    },
    diagnostics,
    critique: buildScenarioPackageDraftCritique(validation.issues, diagnostics),
  };
}

export async function generateScenarioPackageDraft(
  context: ScenarioPackageDraftContext
): Promise<ScenarioPackageDraftResult> {
  if (!isLLMConfigured()) {
    throw new Error("LLM provider is not configured");
  }

  const provider = getLLMProvider();
  const prompt = buildScenarioPackageDraftPrompt(context);
  const raw = await provider.complete({
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    maxTokens: 4000,
    temperature: 0.3,
  });

  return finalizeScenarioPackageDraft(raw, context.validationContext);
}
