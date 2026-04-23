import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const integer = z.number().int();

export const scenarioBuilderResourceDraftSchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    value: integer.optional().default(0),
    minValue: integer.optional().default(0),
    maxValue: integer.optional().default(9999),
  })
  .strict();

export const scenarioBuilderActorDraftSchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    description: z.string().optional().default(""),
    goals: z.array(z.string()).optional().default([]),
    traits: z.array(z.string()).optional().default([]),
    isPlayer: z.boolean().optional().default(false),
    resources: z
      .array(scenarioBuilderResourceDraftSchema)
      .optional()
      .default([]),
  })
  .strict();

export const scenarioBuilderRelationshipDraftSchema = z
  .object({
    id: nonEmptyString,
    fromActorId: nonEmptyString,
    toActorId: nonEmptyString,
    type: z.string().trim().optional().default("neutral"),
    strength: integer.min(0).max(100).optional().default(50),
    description: z.string().nullable().optional().default(null),
  })
  .strict();

export const scenarioBuilderWorldVariableDraftSchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    value: z.string().optional().default(""),
    kind: z
      .enum(["resource", "countdown", "counter", "flag", "text"])
      .optional()
      .default("text"),
    minValue: z.string().nullable().optional().default(null),
    maxValue: z.string().nullable().optional().default(null),
    config: z
      .object({
        step: integer.optional(),
      })
      .strict()
      .nullable()
      .optional()
      .default(null),
  })
  .strict();

export const scenarioBuilderShellDraftSchema = z
  .object({
    name: nonEmptyString,
    description: nonEmptyString,
    worldDescription: z.string().optional().default(""),
    actors: z.array(scenarioBuilderActorDraftSchema).min(1),
    relationships: z
      .array(scenarioBuilderRelationshipDraftSchema)
      .optional()
      .default([]),
    worldVariables: z
      .array(scenarioBuilderWorldVariableDraftSchema)
      .optional()
      .default([]),
  })
  .strict();

export const scenarioBuilderDraftSchema = scenarioBuilderShellDraftSchema
  .extend({
    scenarioPackage: z.unknown(),
  })
  .strict();

export const scenarioBuilderRequirementsQuestionSchema = z
  .object({
    id: nonEmptyString,
    label: nonEmptyString,
    question: nonEmptyString,
    rationale: z.string().optional().default(""),
  })
  .strict();

export const scenarioBuilderRequirementsAnalysisSchema = z
  .object({
    summary: z.string().optional().default(""),
    questions: z
      .array(scenarioBuilderRequirementsQuestionSchema)
      .max(4)
      .optional()
      .default([]),
  })
  .strict();

export const scenarioBuilderAnswerSchema = z
  .object({
    id: nonEmptyString,
    answer: z.string().trim().min(1),
  })
  .strict();

export const scenarioBuilderSectionSchema = z.enum([
  "actors",
  "relationships",
  "worldVariables",
  "scenarioPackage",
]);

export type ScenarioBuilderResourceDraft = z.infer<
  typeof scenarioBuilderResourceDraftSchema
>;
export type ScenarioBuilderActorDraft = z.infer<
  typeof scenarioBuilderActorDraftSchema
>;
export type ScenarioBuilderRelationshipDraft = z.infer<
  typeof scenarioBuilderRelationshipDraftSchema
>;
export type ScenarioBuilderWorldVariableDraft = z.infer<
  typeof scenarioBuilderWorldVariableDraftSchema
>;
export type ScenarioBuilderShellDraft = z.infer<
  typeof scenarioBuilderShellDraftSchema
>;
export type ScenarioBuilderDraft = z.infer<typeof scenarioBuilderDraftSchema>;
export type ScenarioBuilderRequirementsQuestion = z.infer<
  typeof scenarioBuilderRequirementsQuestionSchema
>;
export type ScenarioBuilderRequirementsAnalysis = z.infer<
  typeof scenarioBuilderRequirementsAnalysisSchema
>;
export type ScenarioBuilderAnswer = z.infer<typeof scenarioBuilderAnswerSchema>;
export type ScenarioBuilderSection = z.infer<typeof scenarioBuilderSectionSchema>;
