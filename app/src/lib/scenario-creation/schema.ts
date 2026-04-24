import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

export const scenarioCreationOptionSchema = z
  .object({
    id: nonEmptyString,
    label: nonEmptyString,
    description: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict();

export const scenarioCreationOptionGroupSchema = z
  .object({
    stage: nonEmptyString,
    kind: nonEmptyString,
    title: nonEmptyString,
    description: z.string().optional(),
    selectionMode: z.enum(["single", "multiple"]),
    options: z.array(scenarioCreationOptionSchema).max(6),
  })
  .strict();

export const scenarioCreationWorkingDraftSchema = z
  .object({
    premise: z.string().optional(),
    title: z.string().optional(),
    genre: z.string().optional(),
    mode: z.string().optional(),
    realismLevel: z.string().optional(),
    playerRole: z.string().optional(),
    initialConflict: z.string().optional(),
    actorIdeas: z
      .array(
        z
          .object({
            id: nonEmptyString,
            name: nonEmptyString,
            role: z.string().optional(),
          })
          .strict()
      )
      .optional()
      .default([]),
    worldVariableIdeas: z
      .array(
        z
          .object({
            id: nonEmptyString,
            name: nonEmptyString,
            kind: z.string().optional(),
          })
          .strict()
      )
      .optional()
      .default([]),
    notes: z.array(z.string()).optional().default([]),
    builderDraft: z.unknown().nullable().optional(),
  })
  .strict();

export const scenarioCreationDraftPatchSchema = scenarioCreationWorkingDraftSchema
  .partial()
  .strict();

export const scenarioCreationAssistantResponseSchema = z
  .object({
    message: nonEmptyString,
    optionGroup: scenarioCreationOptionGroupSchema.optional(),
    workingDraftPatch: scenarioCreationDraftPatchSchema.optional(),
  })
  .strict();

export type ScenarioCreationOption = z.infer<typeof scenarioCreationOptionSchema>;
export type ScenarioCreationOptionGroupInput = z.infer<
  typeof scenarioCreationOptionGroupSchema
>;
export type ScenarioCreationWorkingDraft = z.infer<
  typeof scenarioCreationWorkingDraftSchema
>;
export type ScenarioCreationDraftPatch = z.infer<
  typeof scenarioCreationDraftPatchSchema
>;
export type ScenarioCreationAssistantResponse = z.infer<
  typeof scenarioCreationAssistantResponseSchema
>;
