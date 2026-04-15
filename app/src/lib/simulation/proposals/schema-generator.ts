/**
 * Generate Zod schemas dynamically from scenario state.
 *
 * This module creates validation schemas that use actual entity IDs
 * from the current game state, ensuring LLM proposals reference valid targets.
 */

import { z } from 'zod';
import type { ScenarioState } from '@/lib/types';
import type { ScenarioResolverConfig } from '../resolver/config';
import type { ActorResponseConfig, ScenarioPromptConfig } from './config';
import type { ProposedStateChange, ActorIntentProposal, ChoiceEffectsProposal } from './types';

// ---------------------------------------------------------------------------
// Entity extraction helpers
// ---------------------------------------------------------------------------

interface StateEntities {
  actorIds: string[];
  resourceIds: string[];
  worldVariableIds: string[];
  numericWorldVariableIds: string[];
  flagWorldVariableIds: string[];
  textWorldVariableIds: string[];
  relationshipIds: string[];
  relationshipTypes: string[];
}

const NUMERIC_KINDS = new Set(['resource', 'countdown', 'counter']);

/**
 * Extract all entity IDs from current game state.
 */
export function extractStateEntities(state: ScenarioState): StateEntities {
  const actorIds = state.actors.map((a) => a.id);

  // Collect all resource IDs across all actors
  const resourceIds = [
    ...new Set(state.actors.flatMap((a) => a.resources.map((r) => r.id))),
  ];

  const worldVariableIds = state.worldVariables.map((v) => v.id);

  // Partition world variables by kind
  const numericWorldVariableIds = state.worldVariables
    .filter((v) => NUMERIC_KINDS.has(v.kind))
    .map((v) => v.id);

  const flagWorldVariableIds = state.worldVariables
    .filter((v) => v.kind === 'flag')
    .map((v) => v.id);

  const textWorldVariableIds = state.worldVariables
    .filter((v) => v.kind === 'text')
    .map((v) => v.id);

  const relationshipIds = state.relationships.map((r) => r.id);

  // Collect all relationship types currently in use
  const relationshipTypes = [
    ...new Set(state.relationships.map((r) => r.type)),
  ];

  return {
    actorIds,
    resourceIds,
    worldVariableIds,
    numericWorldVariableIds,
    flagWorldVariableIds,
    textWorldVariableIds,
    relationshipIds,
    relationshipTypes,
  };
}

// ---------------------------------------------------------------------------
// Zod schema builders
// ---------------------------------------------------------------------------

const intensitySchema = z.enum(['minor', 'moderate', 'major']);

/**
 * Generate a Zod schema for ProposedStateChange based on current state.
 *
 * The schema validates that:
 * - All IDs reference existing entities
 * - Intensity values are valid
 * - Proposal kinds match available entity types
 *
 * Note: This returns a permissive schema that validates proposal structure.
 * The actual ID validation happens via lenient validation which logs warnings.
 */
export function generateProposalSchema(
  state: ScenarioState,
  _resolverConfig?: ScenarioResolverConfig,
  _promptConfig?: ScenarioPromptConfig | null,
  _actorConfig?: ActorResponseConfig | null
): z.ZodType<ProposedStateChange> {
  const entities = extractStateEntities(state);

  // Create sets for validation
  const validActorIds = new Set(entities.actorIds);
  const validResourceIds = new Set(entities.resourceIds);
  const validNumericVarIds = new Set(entities.numericWorldVariableIds);
  const validFactVarIds = new Set([...entities.flagWorldVariableIds, ...entities.textWorldVariableIds]);
  const validRelationshipIds = new Set(entities.relationshipIds);

  // Build schemas for each kind with custom refinements
  const actorResourceDelta = z.object({
    kind: z.literal('actor_resource_delta'),
    actorId: z.string().refine(
      (id) => validActorIds.size === 0 || validActorIds.has(id),
      { message: 'Invalid actor ID' }
    ),
    resourceId: z.string().refine(
      (id) => validResourceIds.size === 0 || validResourceIds.has(id),
      { message: 'Invalid resource ID' }
    ),
    intensity: intensitySchema,
  });

  const worldNumericDelta = z.object({
    kind: z.literal('world_numeric_delta'),
    variableId: z.string().refine(
      (id) => validNumericVarIds.size === 0 || validNumericVarIds.has(id),
      { message: 'Invalid world variable ID' }
    ),
    intensity: intensitySchema,
  });

  const worldFactSet = z.object({
    kind: z.literal('world_fact_set'),
    variableId: z.string().refine(
      (id) => validFactVarIds.size === 0 || validFactVarIds.has(id),
      { message: 'Invalid world variable ID' }
    ),
    value: z.union([z.string(), z.boolean()]),
    reason: z.string(),
  });

  const relationshipStrengthDelta = z.object({
    kind: z.literal('relationship_strength_delta'),
    relationshipId: z.string().refine(
      (id) => validRelationshipIds.size === 0 || validRelationshipIds.has(id),
      { message: 'Invalid relationship ID' }
    ),
    intensity: intensitySchema,
  });

  const relationshipTypeSet = z.object({
    kind: z.literal('relationship_type_set'),
    relationshipId: z.string().refine(
      (id) => validRelationshipIds.size === 0 || validRelationshipIds.has(id),
      { message: 'Invalid relationship ID' }
    ),
    newType: z.string(),
    reason: z.string(),
  });

  // Combine into a discriminated union
  return z.discriminatedUnion('kind', [
    actorResourceDelta,
    worldNumericDelta,
    worldFactSet,
    relationshipStrengthDelta,
    relationshipTypeSet,
  ]);
}

/**
 * Generate a Zod schema for ActorIntentProposal.
 */
export function generateActorIntentSchema(
  state: ScenarioState,
  resolverConfig?: ScenarioResolverConfig,
  promptConfig?: ScenarioPromptConfig | null,
  actorConfig?: ActorResponseConfig | null
): z.ZodType<ActorIntentProposal> {
  const proposalSchema = generateProposalSchema(state, resolverConfig, promptConfig, actorConfig);

  return z.object({
    action: z.string().min(1),
    reasoning: z.string().min(1),
    proposals: z.array(proposalSchema),
  });
}

/**
 * Generate a Zod schema for ChoiceEffectsProposal.
 */
export function generateChoiceEffectsSchema(
  state: ScenarioState,
  resolverConfig?: ScenarioResolverConfig,
  promptConfig?: ScenarioPromptConfig | null
): z.ZodType<ChoiceEffectsProposal> {
  const proposalSchema = generateProposalSchema(state, resolverConfig, promptConfig);

  return z.object({
    proposals: z.array(proposalSchema),
  });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export interface ValidationError {
  path: string[];
  message: string;
}

export interface ProposalValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Validate a parsed LLM response against a generated schema.
 * Returns structured errors with path information.
 */
export function validateWithSchema<T>(
  schema: z.ZodType<T>,
  data: unknown
): ProposalValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: ValidationError[] = result.error.issues.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }));

  return { success: false, errors };
}

/**
 * Lenient validation that extracts valid proposals and logs invalid ones.
 * Used for backwards compatibility during migration.
 */
export function validateProposalsLenient(
  proposalSchema: z.ZodType<ProposedStateChange>,
  proposals: unknown[]
): { valid: ProposedStateChange[]; invalid: { index: number; errors: ValidationError[] }[] } {
  const valid: ProposedStateChange[] = [];
  const invalid: { index: number; errors: ValidationError[] }[] = [];

  for (let i = 0; i < proposals.length; i++) {
    const result = validateWithSchema(proposalSchema, proposals[i]);
    if (result.success && result.data) {
      valid.push(result.data);
    } else {
      invalid.push({ index: i, errors: result.errors ?? [] });
    }
  }

  return { valid, invalid };
}

// ---------------------------------------------------------------------------
// Entity lookup map for prompt building
// ---------------------------------------------------------------------------

export interface EntityLookupMap {
  actorIdToName: Map<string, string>;
  resourceIdToName: Map<string, string>;
  worldVariableIdToName: Map<string, string>;
  relationshipIdToDescription: Map<string, string>;
}

/**
 * Build lookup maps from state entities for use in prompts.
 * Allows prompts to show human-readable names while using IDs internally.
 */
export function buildEntityLookupMap(state: ScenarioState): EntityLookupMap {
  const actorIdToName = new Map<string, string>();
  const resourceIdToName = new Map<string, string>();
  const worldVariableIdToName = new Map<string, string>();
  const relationshipIdToDescription = new Map<string, string>();

  for (const actor of state.actors) {
    actorIdToName.set(actor.id, actor.name);
    for (const resource of actor.resources) {
      resourceIdToName.set(resource.id, resource.name);
    }
  }

  for (const variable of state.worldVariables) {
    worldVariableIdToName.set(variable.id, variable.name);
  }

  for (const rel of state.relationships) {
    const fromName = actorIdToName.get(rel.fromActorId) ?? rel.fromActorId;
    const toName = actorIdToName.get(rel.toActorId) ?? rel.toActorId;
    relationshipIdToDescription.set(rel.id, `${fromName} → ${toName} (${rel.type})`);
  }

  return {
    actorIdToName,
    resourceIdToName,
    worldVariableIdToName,
    relationshipIdToDescription,
  };
}
