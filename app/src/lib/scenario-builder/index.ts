import { Prisma } from "@/generated/prisma/client";
import { parseJSON } from "@/lib/llm/parse";
import { getLLMProvider, isLLMConfigured } from "@/lib/llm/provider";
import { z } from "zod";
import {
  diagnoseScenarioPackage,
  validateScenarioPackage,
  type ScenarioPackageDiagnostic,
} from "@/lib/scenario-dsl";
import { generateScenarioPackageDraft } from "@/lib/scenario-dsl/draft-generation";
import {
  scenarioBuilderActorDraftSchema,
  scenarioBuilderDraftSchema,
  scenarioBuilderRelationshipDraftSchema,
  scenarioBuilderRequirementsAnalysisSchema,
  scenarioBuilderShellDraftSchema,
  scenarioBuilderWorldVariableDraftSchema,
  type ScenarioBuilderAnswer,
  type ScenarioBuilderDraft,
  type ScenarioBuilderRequirementsAnalysis,
  type ScenarioBuilderSection,
  type ScenarioBuilderShellDraft,
} from "./schema";

export interface ScenarioBuilderIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface ScenarioBuilderValidationResult {
  valid: boolean;
  issues: ScenarioBuilderIssue[];
  diagnostics: ScenarioPackageDiagnostic[];
}

export interface ScenarioBuilderDraftResult {
  draft: ScenarioBuilderDraft | null;
  validation: ScenarioBuilderValidationResult;
  critique: string[];
}

export interface ScenarioBuilderRequirementsResult {
  analysis: ScenarioBuilderRequirementsAnalysis;
}

export type ScenarioBuilderDb = typeof import("@/lib/db").db;

function normalizeAnswers(answers: ScenarioBuilderAnswer[] = []) {
  return answers
    .map((answer) => ({
      id: answer.id.trim(),
      answer: answer.answer.trim(),
    }))
    .filter((answer) => answer.id && answer.answer);
}

export function buildScenarioBuilderAuthorContext(
  authorPrompt: string,
  answers: ScenarioBuilderAnswer[] = []
) {
  const normalizedAnswers = normalizeAnswers(answers);
  if (normalizedAnswers.length === 0) return authorPrompt.trim();

  return `${authorPrompt.trim()}

Additional author clarifications:
${normalizedAnswers
  .map((answer) => `- ${answer.id}: ${answer.answer}`)
  .join("\n")}`;
}

function pushUniqueIdIssues(
  issues: ScenarioBuilderIssue[],
  kind: string,
  ids: string[],
  path: string
) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({
        severity: "error",
        path,
        message: `Duplicate ${kind} id "${id}"`,
      });
      continue;
    }
    seen.add(id);
  }
}

export function buildScenarioRequirementsPrompt(authorPrompt: string): {
  system: string;
  user: string;
} {
  return {
    system: `You analyze scenario pitches for a structured simulation builder.

Output ONLY valid JSON. Do not wrap it in markdown fences.

Return one JSON object with this shape:
{
  "summary": "short summary",
  "questions": [
    {
      "id": "string",
      "label": "short label",
      "question": "specific question",
      "rationale": "why this matters"
    }
  ]
}

Rules:
- Ask at most 4 questions.
- Ask only high-value questions that materially affect scenario structure, strategy, or simulation pressure.
- Prefer missing items like player role, opposing force, pressure/resource model, and failure pressure.
- If the author prompt is already strong enough, return an empty questions array.
- Keep labels short and concrete.`,
    user: `Author prompt:
${authorPrompt.trim()}`,
  };
}

export function finalizeScenarioRequirementsAnalysis(
  raw: string
): ScenarioBuilderRequirementsAnalysis {
  const parsed = parseJSON<unknown>(raw);
  return scenarioBuilderRequirementsAnalysisSchema.parse(parsed);
}

export async function analyzeScenarioBuilderRequirements(
  authorPrompt: string
): Promise<ScenarioBuilderRequirementsResult> {
  if (!isLLMConfigured()) {
    throw new Error("LLM provider is not configured");
  }

  const provider = getLLMProvider();
  const prompt = buildScenarioRequirementsPrompt(authorPrompt);
  const raw = await provider.complete({
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    maxTokens: 1200,
    temperature: 0.2,
  });

  return {
    analysis: finalizeScenarioRequirementsAnalysis(raw),
  };
}

export function buildScenarioBuilderShellPrompt(
  authorPrompt: string,
  answers: ScenarioBuilderAnswer[] = []
): {
  system: string;
  user: string;
} {
  return {
    system: `You draft structured scenario JSON for a simulation editor.

Output ONLY valid JSON. Do not wrap it in markdown fences.

Return one JSON object with exactly this shape:
{
  "name": "string",
  "description": "string",
  "worldDescription": "string",
  "actors": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "goals": ["string"],
      "traits": ["string"],
      "isPlayer": true,
      "resources": [
        {
          "id": "string",
          "name": "string",
          "value": 0,
          "minValue": 0,
          "maxValue": 100
        }
      ]
    }
  ],
  "relationships": [
    {
      "id": "string",
      "fromActorId": "string",
      "toActorId": "string",
      "type": "ally|rival|neutral|dependent|protective|suspicious",
      "strength": 50,
      "description": "string or null"
    }
  ],
  "worldVariables": [
    {
      "id": "string",
      "name": "string",
      "value": "string",
      "kind": "resource|countdown|counter|flag|text",
      "minValue": "string or null",
      "maxValue": "string or null",
      "config": { "step": 1 } or null
    }
  ]
}

Rules:
- Keep the draft lean but complete enough to play and edit.
- Create 2-5 actors unless the prompt clearly needs more.
- Exactly one actor must have "isPlayer": true.
- Include only distinct actors and relationships.
- Actor, resource, relationship, and world variable ids must be stable snake_case style strings.
- Resource ids must be globally unique across the scenario.
- Relationship ids must be globally unique across the scenario.
- Make relationships directional when it helps the simulation.
- Include a few world variables only when they matter to ongoing tension or pacing.
- Prefer concrete tracked resources over vague flavor data.
- Do not include scenarioPackage in this response.`,
    user: `Author context:
${buildScenarioBuilderAuthorContext(authorPrompt, answers)}`,
  };
}

export function validateScenarioBuilderShellDraft(
  draft: ScenarioBuilderShellDraft
): ScenarioBuilderIssue[] {
  const issues: ScenarioBuilderIssue[] = [];

  if (!draft.name.trim()) {
    issues.push({
      severity: "error",
      path: "name",
      message: "Scenario name is required.",
    });
  }

  if (!draft.description.trim()) {
    issues.push({
      severity: "error",
      path: "description",
      message: "Scenario description is required.",
    });
  }

  if (draft.actors.length === 0) {
    issues.push({
      severity: "error",
      path: "actors",
      message: "At least one actor is required.",
    });
  }

  const playerCount = draft.actors.filter((actor) => actor.isPlayer).length;
  if (playerCount !== 1) {
    issues.push({
      severity: "error",
      path: "actors",
      message: `Exactly one player actor is required; found ${playerCount}.`,
    });
  }

  pushUniqueIdIssues(
    issues,
    "actor",
    draft.actors.map((actor) => actor.id),
    "actors"
  );
  pushUniqueIdIssues(
    issues,
    "resource",
    draft.actors.flatMap((actor) => actor.resources.map((resource) => resource.id)),
    "actors.resources"
  );
  pushUniqueIdIssues(
    issues,
    "relationship",
    draft.relationships.map((relationship) => relationship.id),
    "relationships"
  );
  pushUniqueIdIssues(
    issues,
    "world variable",
    draft.worldVariables.map((variable) => variable.id),
    "worldVariables"
  );

  const actorIds = new Set(draft.actors.map((actor) => actor.id));

  draft.actors.forEach((actor, actorIndex) => {
    if (!actor.name.trim()) {
      issues.push({
        severity: "error",
        path: `actors.${actorIndex}.name`,
        message: "Actor name is required.",
      });
    }

    actor.resources.forEach((resource, resourceIndex) => {
      if (resource.minValue > resource.maxValue) {
        issues.push({
          severity: "error",
          path: `actors.${actorIndex}.resources.${resourceIndex}`,
          message: `Resource "${resource.id}" has minValue greater than maxValue.`,
        });
      }
    });
  });

  draft.relationships.forEach((relationship, index) => {
    if (!actorIds.has(relationship.fromActorId)) {
      issues.push({
        severity: "error",
        path: `relationships.${index}.fromActorId`,
        message: `Unknown actor "${relationship.fromActorId}"`,
      });
    }
    if (!actorIds.has(relationship.toActorId)) {
      issues.push({
        severity: "error",
        path: `relationships.${index}.toActorId`,
        message: `Unknown actor "${relationship.toActorId}"`,
      });
    }
    if (relationship.fromActorId === relationship.toActorId) {
      issues.push({
        severity: "error",
        path: `relationships.${index}.toActorId`,
        message: "Relationships cannot target the same actor.",
      });
    }
  });

  if (draft.relationships.length === 0) {
    issues.push({
      severity: "warning",
      path: "relationships",
      message: "No relationships are defined. The scenario may lack strategic tension.",
    });
  }

  if (draft.worldVariables.length === 0) {
    issues.push({
      severity: "warning",
      path: "worldVariables",
      message: "No world variables are defined. The scenario may lack ongoing pressure.",
    });
  }

  const playerActor = draft.actors.find((actor) => actor.isPlayer);
  if (playerActor && playerActor.resources.length === 0) {
    issues.push({
      severity: "warning",
      path: "actors",
      message: "The player actor has no tracked resources.",
    });
  }

  return issues;
}

export function finalizeScenarioBuilderShellDraft(raw: string): {
  draft: ScenarioBuilderShellDraft | null;
  issues: ScenarioBuilderIssue[];
} {
  let parsed: unknown;

  try {
    parsed = parseJSON<unknown>(raw);
  } catch (error) {
    return {
      draft: null,
      issues: [
        {
          severity: "error",
          path: "scenarioDraft",
          message:
            error instanceof Error ? error.message : "Failed to parse draft JSON",
        },
      ],
    };
  }

  const result = scenarioBuilderShellDraftSchema.safeParse(parsed);
  if (!result.success) {
    return {
      draft: null,
      issues: result.error.issues.map((issue) => ({
        severity: "error" as const,
        path: issue.path.join(".") || "scenarioDraft",
        message: issue.message,
      })),
    };
  }

  return {
    draft: result.data,
    issues: validateScenarioBuilderShellDraft(result.data),
  };
}

function toPackageValidationContext(draft: ScenarioBuilderShellDraft) {
  return {
    actorIds: draft.actors.map((actor) => actor.id),
    resourceIds: draft.actors.flatMap((actor) =>
      actor.resources.map((resource) => resource.id)
    ),
    worldVariableIds: draft.worldVariables.map((variable) => variable.id),
    relationshipIds: draft.relationships.map((relationship) => relationship.id),
  };
}

function buildPackageScenarioContext(draft: ScenarioBuilderShellDraft) {
  return {
    name: draft.name,
    description: draft.description,
    worldDescription: draft.worldDescription,
    actors: draft.actors.map((actor) => ({
      id: actor.id,
      name: actor.name,
      description: actor.description,
      goals: actor.goals,
      traits: actor.traits,
      isPlayer: actor.isPlayer,
      resources: actor.resources,
      relationshipsFrom: draft.relationships
        .filter((relationship) => relationship.fromActorId === actor.id)
        .map((relationship) => {
          const toActor = draft.actors.find(
            (candidate) => candidate.id === relationship.toActorId
          );
          return {
            id: relationship.id,
            toActorId: relationship.toActorId,
            toActorName: toActor?.name,
            type: relationship.type,
            strength: relationship.strength,
            description: relationship.description,
          };
        }),
    })),
    worldVariables: draft.worldVariables,
  };
}

async function generatePackageForShellDraft(
  shellDraft: ScenarioBuilderShellDraft,
  authorPrompt: string,
  answers: ScenarioBuilderAnswer[] = [],
  refinementPrompt?: string,
  existingPackage?: unknown | null
) {
  const packageAuthorPrompt = [
    buildScenarioBuilderAuthorContext(authorPrompt, answers),
    refinementPrompt?.trim()
      ? `Section refinement request:\n${refinementPrompt.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return generateScenarioPackageDraft({
    authorPrompt: packageAuthorPrompt,
    validationContext: toPackageValidationContext(shellDraft),
    scenario: {
      ...buildPackageScenarioContext(shellDraft),
      existingPackage: existingPackage ?? null,
    },
  });
}

export async function generateScenarioBuilderDraft(
  authorPrompt: string,
  answers: ScenarioBuilderAnswer[] = []
): Promise<ScenarioBuilderDraftResult> {
  if (!isLLMConfigured()) {
    throw new Error("LLM provider is not configured");
  }

  const provider = getLLMProvider();
  const shellPrompt = buildScenarioBuilderShellPrompt(authorPrompt, answers);
  const rawShell = await provider.complete({
    messages: [
      { role: "system", content: shellPrompt.system },
      { role: "user", content: shellPrompt.user },
    ],
    maxTokens: 4000,
    temperature: 0.4,
  });

  const shellResult = finalizeScenarioBuilderShellDraft(rawShell);
  if (!shellResult.draft) {
    return {
      draft: null,
      validation: {
        valid: false,
        issues: shellResult.issues,
        diagnostics: [],
      },
      critique: buildScenarioBuilderCritique(shellResult.issues, []),
    };
  }

  const shellDraft = shellResult.draft;
  const packageResult = await generatePackageForShellDraft(
    shellDraft,
    authorPrompt,
    answers
  );

  const issues = [
    ...shellResult.issues,
    ...packageResult.validation.issues.map((issue) => ({
      severity: issue.severity,
      path: issue.path,
      message: issue.message,
    })),
  ];

  return {
    draft: packageResult.draft
      ? {
          ...shellDraft,
          scenarioPackage: packageResult.draft,
        }
      : null,
    validation: {
      valid: issues.every((issue) => issue.severity !== "error"),
      issues,
      diagnostics: packageResult.diagnostics,
    },
    critique: buildScenarioBuilderCritique(issues, packageResult.diagnostics),
  };
}

function parseSectionArray<T>(
  raw: string,
  schema: z.ZodType<T[]>
): { data: T[] | null; issues: ScenarioBuilderIssue[] } {
  let parsed: unknown;

  try {
    parsed = parseJSON<unknown>(raw);
  } catch (error) {
    return {
      data: null,
      issues: [
        {
          severity: "error",
          path: "scenarioDraft",
          message:
            error instanceof Error ? error.message : "Failed to parse section JSON",
        },
      ],
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      data: null,
      issues: result.error.issues.map((issue) => ({
        severity: "error" as const,
        path: issue.path.map(String).join(".") || "scenarioDraft",
        message: issue.message,
      })),
    };
  }

  return { data: result.data, issues: [] };
}

export function buildScenarioSectionRegenerationPrompt(args: {
  draft: ScenarioBuilderDraft;
  section: Exclude<ScenarioBuilderSection, "scenarioPackage">;
  authorPrompt: string;
  refinementPrompt?: string;
  answers?: ScenarioBuilderAnswer[];
}): { system: string; user: string } {
  const sectionShape =
    args.section === "actors"
      ? `[
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "goals": ["string"],
    "traits": ["string"],
    "isPlayer": true,
    "resources": [
      {
        "id": "string",
        "name": "string",
        "value": 0,
        "minValue": 0,
        "maxValue": 100
      }
    ]
  }
]`
      : args.section === "relationships"
        ? `[
  {
    "id": "string",
    "fromActorId": "string",
    "toActorId": "string",
    "type": "string",
    "strength": 50,
    "description": "string or null"
  }
]`
        : `[
  {
    "id": "string",
    "name": "string",
    "value": "string",
    "kind": "resource|countdown|counter|flag|text",
    "minValue": "string or null",
    "maxValue": "string or null",
    "config": { "step": 1 } or null
  }
]`;

  return {
    system: `You regenerate one section of a structured scenario draft.

Output ONLY valid JSON. Do not wrap it in markdown fences.

Return ONLY the "${args.section}" section as JSON using this shape:
${sectionShape}

Rules:
- Keep ids self-consistent and stable snake_case strings.
- Preserve compatibility with the rest of the scenario where reasonable.
- Exactly one actor must remain the player if regenerating actors.
- If you introduce new ids, make them coherent and reusable.
- Regenerate only the requested section, not the whole scenario.`,
    user: `Author context:
${buildScenarioBuilderAuthorContext(args.authorPrompt, args.answers ?? [])}

Current draft:
${JSON.stringify(args.draft, null, 2)}

Requested section:
${args.section}

Refinement request:
${args.refinementPrompt?.trim() || "Refresh this section while keeping it aligned with the scenario concept."}`,
  };
}

export async function regenerateScenarioBuilderSection(args: {
  draft: ScenarioBuilderDraft;
  section: ScenarioBuilderSection;
  authorPrompt: string;
  refinementPrompt?: string;
  answers?: ScenarioBuilderAnswer[];
}): Promise<ScenarioBuilderDraftResult> {
  if (!isLLMConfigured()) {
    throw new Error("LLM provider is not configured");
  }

  if (args.section === "scenarioPackage") {
    const packageResult = await generatePackageForShellDraft(
      args.draft,
      args.authorPrompt,
      args.answers ?? [],
      args.refinementPrompt,
      args.draft.scenarioPackage
    );

    const nextDraft = packageResult.draft
      ? {
          ...args.draft,
          scenarioPackage: packageResult.draft,
        }
      : null;

    if (!nextDraft) {
      return {
        draft: null,
        validation: {
          valid: false,
          issues: packageResult.validation.issues.map((issue) => ({
            severity: issue.severity,
            path: issue.path,
            message: issue.message,
          })),
          diagnostics: packageResult.diagnostics,
        },
        critique: buildScenarioBuilderCritique(
          packageResult.validation.issues.map((issue) => ({
            severity: issue.severity,
            path: issue.path,
            message: issue.message,
          })),
          packageResult.diagnostics
        ),
      };
    }

    return buildScenarioBuilderDraftResult(nextDraft);
  }

  const provider = getLLMProvider();
  const prompt = buildScenarioSectionRegenerationPrompt({
    draft: args.draft,
    section: args.section,
    authorPrompt: args.authorPrompt,
    refinementPrompt: args.refinementPrompt,
    answers: args.answers ?? [],
  });

  const raw = await provider.complete({
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    maxTokens: 3000,
    temperature: 0.35,
  });

  const parsedSection =
    args.section === "actors"
      ? parseSectionArray(raw, scenarioBuilderActorDraftSchema.array())
      : args.section === "relationships"
        ? parseSectionArray(raw, scenarioBuilderRelationshipDraftSchema.array())
        : parseSectionArray(raw, scenarioBuilderWorldVariableDraftSchema.array());

  if (!parsedSection.data) {
    return {
      draft: null,
      validation: {
        valid: false,
        issues: parsedSection.issues,
        diagnostics: [],
      },
      critique: buildScenarioBuilderCritique(parsedSection.issues, []),
    };
  }

  let nextShellDraft: ScenarioBuilderShellDraft;
  if (args.section === "actors") {
    nextShellDraft = {
      ...args.draft,
      actors: parsedSection.data as ScenarioBuilderDraft["actors"],
    };
  } else if (args.section === "relationships") {
    nextShellDraft = {
      ...args.draft,
      relationships: parsedSection.data as ScenarioBuilderDraft["relationships"],
    };
  } else {
    nextShellDraft = {
      ...args.draft,
      worldVariables: parsedSection.data as ScenarioBuilderDraft["worldVariables"],
    };
  }

  const packageResult = await generatePackageForShellDraft(
    nextShellDraft,
    args.authorPrompt,
    args.answers ?? [],
    args.refinementPrompt,
    args.draft.scenarioPackage
  );

  if (!packageResult.draft) {
    return {
      draft: null,
      validation: {
        valid: false,
        issues: packageResult.validation.issues.map((issue) => ({
          severity: issue.severity,
          path: issue.path,
          message: issue.message,
        })),
        diagnostics: packageResult.diagnostics,
      },
      critique: buildScenarioBuilderCritique(
        packageResult.validation.issues.map((issue) => ({
          severity: issue.severity,
          path: issue.path,
          message: issue.message,
        })),
        packageResult.diagnostics
      ),
    };
  }

  return buildScenarioBuilderDraftResult({
    ...nextShellDraft,
    scenarioPackage: packageResult.draft,
  });
}

export function validateScenarioBuilderDraft(
  draft: ScenarioBuilderDraft
): ScenarioBuilderValidationResult {
  const shellIssues = validateScenarioBuilderShellDraft(draft);

  const packageValidation = validateScenarioPackage(draft.scenarioPackage, {
    actorIds: draft.actors.map((actor) => actor.id),
    resourceIds: draft.actors.flatMap((actor) =>
      actor.resources.map((resource) => resource.id)
    ),
    worldVariableIds: draft.worldVariables.map((variable) => variable.id),
    relationshipIds: draft.relationships.map((relationship) => relationship.id),
  });

  const issues = [
    ...shellIssues,
    ...packageValidation.issues.map((issue) => ({
      severity: issue.severity,
      path: issue.path,
      message: issue.message,
    })),
  ];

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
    diagnostics: packageValidation.package
      ? buildScenarioPackageDiagnostics(packageValidation.package, draft)
      : [],
  };
}

function buildScenarioPackageDiagnostics(
  scenarioPackage: NonNullable<ReturnType<typeof validateScenarioPackage>["package"]>,
  draft: ScenarioBuilderDraft
) {
  return diagnoseScenarioPackage(scenarioPackage, {
    actorIds: draft.actors.map((actor) => actor.id),
    resourceIds: draft.actors.flatMap((actor) =>
      actor.resources.map((resource) => resource.id)
    ),
    worldVariableIds: draft.worldVariables.map((variable) => variable.id),
    relationshipIds: draft.relationships.map((relationship) => relationship.id),
  }).diagnostics;
}

export function parseScenarioBuilderDraft(input: unknown): ScenarioBuilderDraft {
  return scenarioBuilderDraftSchema.parse(input);
}

export function buildScenarioBuilderDraftResult(
  draft: ScenarioBuilderDraft
): ScenarioBuilderDraftResult {
  const validation = validateScenarioBuilderDraft(draft);
  return {
    draft,
    validation,
    critique: buildScenarioBuilderCritique(validation.issues, validation.diagnostics),
  };
}

export function buildScenarioBuilderCritique(
  issues: ScenarioBuilderIssue[],
  diagnostics: ScenarioPackageDiagnostic[]
): string[] {
  if (issues.length === 0 && diagnostics.length === 0) {
    return ["Draft passed validation and is ready to create as a scenario."];
  }

  const critique: string[] = [];
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  if (errorCount > 0) {
    critique.push(
      `Fix ${errorCount} validation error${errorCount === 1 ? "" : "s"} before creating this scenario.`
    );
  }

  if (warningCount > 0) {
    critique.push(
      `${warningCount} warning${warningCount === 1 ? "" : "s"} may still be worth cleaning up.`
    );
  }

  if (diagnostics.length > 0) {
    critique.push(
      `${diagnostics.length} package diagnostic${diagnostics.length === 1 ? "" : "s"} highlight likely runtime or authoring gaps.`
    );
  }

  for (const issue of issues.slice(0, 4)) {
    critique.push(`${issue.path || "scenarioDraft"}: ${issue.message}`);
  }

  for (const diagnostic of diagnostics.slice(0, Math.max(0, 4 - issues.length))) {
    critique.push(`${diagnostic.path || "scenarioPackage"}: ${diagnostic.message}`);
  }

  return critique;
}

export async function createScenarioFromBuilderDraft(
  db: ScenarioBuilderDb,
  draft: ScenarioBuilderDraft
) {
  const validation = validateScenarioBuilderDraft(draft);
  if (!validation.valid) {
    throw new Error("Scenario draft is not valid");
  }

  return db.$transaction(async (tx) => {
    const scenario = await tx.scenario.create({
      data: {
        name: draft.name,
        description: draft.description,
        worldDescription: draft.worldDescription,
        scenarioPackage: draft.scenarioPackage as Prisma.InputJsonValue,
      },
    });

    for (const actor of draft.actors) {
      await tx.actor.create({
        data: {
          id: actor.id,
          scenarioId: scenario.id,
          name: actor.name,
          description: actor.description,
          goals: actor.goals,
          traits: actor.traits,
          isPlayer: actor.isPlayer,
          resources: actor.resources.length
            ? {
                create: actor.resources.map((resource) => ({
                  id: resource.id,
                  name: resource.name,
                  value: resource.value,
                  minValue: resource.minValue,
                  maxValue: resource.maxValue,
                })),
              }
            : undefined,
        },
      });
    }

    for (const relationship of draft.relationships) {
      await tx.actorRelationship.create({
        data: {
          id: relationship.id,
          fromActorId: relationship.fromActorId,
          toActorId: relationship.toActorId,
          type: relationship.type,
          strength: relationship.strength,
          description: relationship.description,
        },
      });
    }

    for (const variable of draft.worldVariables) {
      await tx.worldVariable.create({
        data: {
          id: variable.id,
          scenarioId: scenario.id,
          name: variable.name,
          value: variable.value,
          kind: variable.kind,
          minValue: variable.minValue,
          maxValue: variable.maxValue,
          config:
            variable.config === null
              ? Prisma.JsonNull
              : (variable.config as Prisma.InputJsonValue),
        },
      });
    }

    return scenario;
  });
}
