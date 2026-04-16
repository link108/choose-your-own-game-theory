import { z } from "zod";
import { SCENARIO_PACKAGE_VERSION } from "./types";

const idSchema = z.string().trim().min(1).regex(/^[a-zA-Z0-9_.:-]+$/);
const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);

export const fieldDefinitionSchema = z
  .object({
    kind: z.enum(["string", "number", "boolean", "enum"]),
    label: z.string().optional(),
    required: z.boolean().optional(),
    visible: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    values: z.array(z.string()).optional(),
    defaultValue: scalarSchema.optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.kind === "enum" && (!field.values || field.values.length === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["values"],
        message: "Enum fields must define at least one value",
      });
    }
    if (
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["min"],
        message: "min must be less than or equal to max",
      });
    }
  });

export const scenarioObjectTypeSchema = z
  .object({
    id: idSchema,
    label: z.string().trim().min(1),
    description: z.string().optional(),
    fields: z.record(idSchema, fieldDefinitionSchema),
  })
  .strict();

export const scenarioObjectSchema = z
  .object({
    id: idSchema,
    typeId: idSchema,
    name: z.string().trim().min(1),
    fields: z.record(idSchema, scalarSchema),
    visibility: z.enum(["visible", "hidden", "revealed"]),
  })
  .strict();

export const operationDefinitionSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("adjustActorResource"),
      actor: z.string().trim().min(1),
      resource: z.string().trim().min(1),
      delta: z.number(),
    })
    .strict(),
  z
    .object({
      op: z.literal("setActorResource"),
      actor: z.string().trim().min(1),
      resource: z.string().trim().min(1),
      value: z.number(),
    })
    .strict(),
  z
    .object({
      op: z.literal("adjustRelationship"),
      relationship: z.string().trim().min(1),
      delta: z.number(),
    })
    .strict(),
  z
    .object({
      op: z.literal("setRelationshipType"),
      relationship: z.string().trim().min(1),
      value: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      op: z.literal("adjustWorldVariable"),
      variable: z.string().trim().min(1),
      delta: z.number(),
    })
    .strict(),
  z
    .object({
      op: z.literal("setWorldVariable"),
      variable: z.string().trim().min(1),
      value: scalarSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("setObjectField"),
      object: z.string().trim().min(1),
      field: z.string().trim().min(1),
      value: scalarSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("adjustObjectField"),
      object: z.string().trim().min(1),
      field: z.string().trim().min(1),
      delta: z.number(),
    })
    .strict(),
  z
    .object({
      op: z.literal("createObject"),
      object: scenarioObjectSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("archiveObject"),
      object: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      op: z.literal("addEvent"),
      eventType: z.string().trim().min(1),
      description: z.string().trim().min(1),
      involvedActors: z.array(z.string().trim().min(1)).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal("revealObject"),
      object: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      op: z.literal("hideObject"),
      object: z.string().trim().min(1),
    })
    .strict(),
]);

export const effectParameterDefinitionSchema = z
  .object({
    type: z.enum(["actor", "resource", "relationship", "worldVariable", "object"]),
    objectType: z.string().trim().min(1).optional(),
    required: z.boolean().optional(),
  })
  .strict();

export const effectDefinitionSchema = z
  .object({
    id: idSchema,
    label: z.string().trim().min(1),
    description: z.string().trim().min(1),
    parameters: z.record(idSchema, effectParameterDefinitionSchema).optional(),
    intensities: z
      .object({
        minor: z.array(operationDefinitionSchema).optional(),
        moderate: z.array(operationDefinitionSchema).optional(),
        major: z.array(operationDefinitionSchema).optional(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (effect) => Object.keys(effect.intensities).length > 0,
    {
      message: "Effect must define at least one intensity",
      path: ["intensities"],
    }
  );

export const actorCapabilitySchema = z
  .object({
    actorId: z.string().trim().min(1),
    effectIds: z.array(idSchema),
  })
  .strict();

export const triggerRuleSchema = z
  .object({
    id: idSchema,
    description: z.string().optional(),
    once: z.boolean().optional(),
    when: z
      .object({
        worldVariable: z.string().trim().min(1).optional(),
        object: z.string().trim().min(1).optional(),
        field: z.string().trim().min(1).optional(),
        equals: scalarSchema.optional(),
        lte: z.number().optional(),
        gte: z.number().optional(),
      })
      .strict(),
    operations: z.array(operationDefinitionSchema).min(1),
  })
  .strict();

export const scenarioPackageSchema = z
  .object({
    version: z.literal(SCENARIO_PACKAGE_VERSION),
    metadata: z
      .object({
        title: z.string().trim().min(1),
        summary: z.string().optional(),
      })
      .strict(),
    stateExtensions: z
      .object({
        objectTypes: z.array(scenarioObjectTypeSchema),
        objects: z.array(scenarioObjectSchema),
      })
      .strict(),
    effectDefinitions: z.array(effectDefinitionSchema),
    actorCapabilities: z.array(actorCapabilitySchema).optional(),
    triggerRules: z.array(triggerRuleSchema).optional(),
    choicePolicy: z
      .object({
        minChoices: z.number().int().min(1),
        maxChoices: z.number().int().min(1),
        guidance: z.string().optional(),
        preferredEffectIds: z.array(idSchema).optional(),
      })
      .strict()
      .refine((policy) => policy.minChoices <= policy.maxChoices, {
        message: "minChoices must be less than or equal to maxChoices",
        path: ["minChoices"],
      }),
    visibilityRules: z
      .array(
        z
          .object({
            id: idSchema,
            description: z.string().optional(),
          })
          .strict()
      )
      .optional(),
  })
  .strict();
