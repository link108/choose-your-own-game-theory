import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  scenarioBuilderAnswerSchema,
  scenarioBuilderDraftSchema,
  scenarioBuilderSectionSchema,
} from "@/lib/scenario-builder/schema";
import {
  scenarioCreationOptionGroupSchema,
  scenarioCreationWorkingDraftSchema,
} from "@/lib/scenario-creation/schema";

extendZodWithOpenApi(z);

const nonEmptyString = z.string().trim().min(1);
const integer = z.number().int();
const nullableString = z.string().nullable();

export const idParamSchema = z.object({
  id: nonEmptyString.openapi({
    param: {
      name: "id",
      in: "path",
      required: true,
    },
  }),
});

export const errorResponseSchema = z.object({
  error: z.string(),
  issues: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      })
    )
    .optional(),
});

export const successResponseSchema = z.object({
  success: z.boolean(),
});

export const createScenarioSchema = z
  .object({
    name: nonEmptyString,
    description: nonEmptyString,
    worldDescription: z.string().optional(),
  })
  .strict();

export const updateScenarioSchema = z
  .object({
    name: nonEmptyString.optional(),
    description: nonEmptyString.optional(),
    worldDescription: z.string().optional(),
    status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]).optional(),
    scenarioPackage: z.unknown().nullable().optional(),
  })
  .strict();

export const resourceInputSchema = z
  .object({
    name: nonEmptyString,
    value: integer.optional(),
    minValue: integer.optional(),
    maxValue: integer.optional(),
  })
  .strict()
  .refine(
    (resource) =>
      resource.minValue === undefined ||
      resource.maxValue === undefined ||
      resource.minValue <= resource.maxValue,
    {
      message: "minValue must be less than or equal to maxValue",
      path: ["minValue"],
    }
  );

export const createActorSchema = z
  .object({
    name: nonEmptyString,
    description: z.string().optional(),
    goals: z.array(z.string()).optional(),
    traits: z.array(z.string()).optional(),
    isPlayer: z.boolean().optional(),
    resources: z.array(resourceInputSchema).optional(),
  })
  .strict();

export const updateActorSchema = z
  .object({
    name: nonEmptyString.optional(),
    description: z.string().optional(),
    goals: z.array(z.string()).optional(),
    traits: z.array(z.string()).optional(),
    isPlayer: z.boolean().optional(),
  })
  .strict();

export const createResourceSchema = resourceInputSchema;

export const updateResourceSchema = z
  .object({
    resourceId: nonEmptyString,
    name: nonEmptyString.optional(),
    value: integer.optional(),
    minValue: integer.optional(),
    maxValue: integer.optional(),
  })
  .strict()
  .refine(
    (resource) =>
      resource.minValue === undefined ||
      resource.maxValue === undefined ||
      resource.minValue <= resource.maxValue,
    {
      message: "minValue must be less than or equal to maxValue",
      path: ["minValue"],
    }
  );

export const worldVariableKindSchema = z.enum([
  "resource",
  "countdown",
  "counter",
  "flag",
  "text",
]);

export const worldVariableConfigSchema = z
  .object({
    step: integer.optional(),
  })
  .strict();

export const createWorldVariableSchema = z
  .object({
    name: nonEmptyString,
    value: z.string().optional(),
    kind: worldVariableKindSchema.optional(),
    minValue: nullableString.optional(),
    maxValue: nullableString.optional(),
    config: worldVariableConfigSchema.nullable().optional(),
  })
  .strict();

export const updateWorldVariableSchema = z
  .object({
    variableId: nonEmptyString,
    name: nonEmptyString.optional(),
    value: z.string().optional(),
    kind: worldVariableKindSchema.optional(),
    minValue: nullableString.optional(),
    maxValue: nullableString.optional(),
    config: worldVariableConfigSchema.nullable().optional(),
  })
  .strict();

export const createRelationshipSchema = z
  .object({
    fromActorId: nonEmptyString,
    toActorId: nonEmptyString,
    type: nonEmptyString.optional(),
    strength: integer.min(0).max(100).optional(),
    description: nullableString.optional(),
  })
  .strict()
  .refine((relationship) => relationship.fromActorId !== relationship.toActorId, {
    message: "Cannot create relationship with self",
    path: ["toActorId"],
  });

export const updateRelationshipSchema = z
  .object({
    type: nonEmptyString.optional(),
    strength: integer.min(0).max(100).optional(),
    description: nullableString.optional(),
  })
  .strict();

export const resolveTurnSchema = z
  .object({
    choiceId: nonEmptyString.optional(),
  })
  .strict();

export const regenerateChoicesSchema = z
  .object({
    suggestedAction: z.string().trim().max(200).optional(),
  })
  .strict();

export const generateScenarioPackageDraftSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4000),
  })
  .strict();

export const analyzeScenarioRequirementsSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4000),
  })
  .strict();

export const generateScenarioDraftWithAnswersSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4000),
    answers: z.array(scenarioBuilderAnswerSchema).optional().default([]),
  })
  .strict();

export const validateScenarioDraftSchema = z
  .object({
    draft: scenarioBuilderDraftSchema,
  })
  .strict();

export const createScenarioFromDraftSchema = z
  .object({
    draft: scenarioBuilderDraftSchema,
  })
  .strict();

export const regenerateScenarioDraftSectionSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4000),
    draft: scenarioBuilderDraftSchema,
    section: scenarioBuilderSectionSchema,
    refinementPrompt: z.string().trim().max(4000).optional(),
    answers: z.array(scenarioBuilderAnswerSchema).optional().default([]),
  })
  .strict();

export const createScenarioCreationSessionSchema = z
  .object({
    initialPrompt: z.string().trim().max(4000).optional(),
  })
  .strict();

export const createScenarioCreationMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(4000),
  })
  .strict();

export const scenarioCreationSessionResponseSchema = z
  .object({
    id: nonEmptyString,
    status: z.enum(["ACTIVE", "DRAFT_READY", "ACCEPTED", "ABANDONED"]),
    title: z.string().nullable(),
    sourcePrompt: z.string(),
    workingDraft: scenarioCreationWorkingDraftSchema.nullable(),
    createdScenarioId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    messages: z.array(
      z
        .object({
          id: nonEmptyString,
          role: z.enum(["USER", "ASSISTANT", "SYSTEM"]),
          kind: z.enum(["CHAT", "SUMMARY", "OPTION_PROMPT", "DRAFT_UPDATE"]),
          content: z.string(),
          metadata: z.record(z.string(), z.unknown()).nullable(),
          createdAt: z.string(),
        })
        .strict()
    ),
    optionGroups: z.array(
      z
        .object({
          id: nonEmptyString,
          stage: z.string(),
          kind: z.string(),
          title: z.string(),
          description: z.string().nullable(),
          selectionMode: z.enum(["SINGLE", "MULTIPLE"]),
          status: z.enum(["OPEN", "RESOLVED", "SUPERSEDED"]),
          options: z.array(scenarioCreationOptionGroupSchema.shape.options.element),
          createdAt: z.string(),
          updatedAt: z.string(),
        })
        .strict()
    ),
  })
  .strict();

export type CreateScenarioInput = z.infer<typeof createScenarioSchema>;
export type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>;
export type CreateActorInput = z.infer<typeof createActorSchema>;
export type UpdateActorInput = z.infer<typeof updateActorSchema>;
export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type CreateWorldVariableInput = z.infer<typeof createWorldVariableSchema>;
export type UpdateWorldVariableInput = z.infer<typeof updateWorldVariableSchema>;
export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>;
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>;
export type RegenerateChoicesInput = z.infer<typeof regenerateChoicesSchema>;
export type GenerateScenarioPackageDraftInput = z.infer<
  typeof generateScenarioPackageDraftSchema
>;
export type AnalyzeScenarioRequirementsInput = z.infer<
  typeof analyzeScenarioRequirementsSchema
>;
export type GenerateScenarioDraftWithAnswersInput = z.infer<
  typeof generateScenarioDraftWithAnswersSchema
>;
export type ValidateScenarioDraftInput = z.infer<
  typeof validateScenarioDraftSchema
>;
export type CreateScenarioFromDraftInput = z.infer<
  typeof createScenarioFromDraftSchema
>;
export type RegenerateScenarioDraftSectionInput = z.infer<
  typeof regenerateScenarioDraftSectionSchema
>;
export type CreateScenarioCreationSessionInput = z.infer<
  typeof createScenarioCreationSessionSchema
>;
export type CreateScenarioCreationMessageInput = z.infer<
  typeof createScenarioCreationMessageSchema
>;
