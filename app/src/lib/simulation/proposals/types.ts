/**
 * Typed LLM proposal contracts for scenario-specific structured responses.
 *
 * These types replace the generic SemanticEffect system with explicit,
 * self-documenting proposal types that use IDs instead of names.
 */

/**
 * Intensity levels for gradual changes.
 */
export type Intensity = 'minor' | 'moderate' | 'major';

/**
 * A proposed change to an actor's resource.
 * Example: Decrease player's reputation by a moderate amount.
 */
export interface ActorResourceDelta {
  kind: 'actor_resource_delta';
  actorId: string;
  resourceId: string;
  intensity: Intensity;
}

/**
 * A proposed change to a numeric world variable.
 * Example: Increase regional tension by a minor amount.
 */
export interface WorldNumericDelta {
  kind: 'world_numeric_delta';
  variableId: string;
  intensity: Intensity;
}

/**
 * A proposed change to a world flag or text variable.
 * Example: Set the "war_declared" flag to true.
 */
export interface WorldFactSet {
  kind: 'world_fact_set';
  variableId: string;
  value: string | boolean;
  reason: string;
}

/**
 * A proposed change to a relationship's strength.
 * Example: Decrease the strength of player-merchant relationship.
 */
export interface RelationshipStrengthDelta {
  kind: 'relationship_strength_delta';
  relationshipId: string;
  intensity: Intensity;
}

/**
 * A proposed change to a relationship's type.
 * Example: Change relationship type from "neutral" to "ally".
 */
export interface RelationshipTypeSet {
  kind: 'relationship_type_set';
  relationshipId: string;
  newType: string;
  reason: string;
}

/**
 * Discriminated union of all proposal types.
 *
 * Each proposal explicitly declares its target (using IDs, not names)
 * and whether it's a delta change or an absolute set.
 */
export type ProposedStateChange =
  | ActorResourceDelta
  | WorldNumericDelta
  | WorldFactSet
  | RelationshipStrengthDelta
  | RelationshipTypeSet;

/**
 * Extract the kind from a ProposedStateChange for type narrowing.
 */
export type ProposalKind = ProposedStateChange['kind'];

/**
 * Contract for NPC response with structured proposals.
 */
export interface ActorIntentProposal {
  action: string;
  reasoning: string;
  proposals: ProposedStateChange[];
}

/**
 * Contract for player choice consequences.
 */
export interface ChoiceEffectsProposal {
  proposals: ProposedStateChange[];
}

/**
 * Contract for world fact updates (e.g., after environmental shifts).
 */
export interface WorldFactUpdateProposal {
  proposals: ProposedStateChange[];
}

/**
 * Helper to check if a proposal is a delta-based change.
 */
export function isDeltaProposal(
  proposal: ProposedStateChange
): proposal is ActorResourceDelta | WorldNumericDelta | RelationshipStrengthDelta {
  return (
    proposal.kind === 'actor_resource_delta' ||
    proposal.kind === 'world_numeric_delta' ||
    proposal.kind === 'relationship_strength_delta'
  );
}

/**
 * Helper to check if a proposal is a set-based change.
 */
export function isSetProposal(
  proposal: ProposedStateChange
): proposal is WorldFactSet | RelationshipTypeSet {
  return (
    proposal.kind === 'world_fact_set' ||
    proposal.kind === 'relationship_type_set'
  );
}
