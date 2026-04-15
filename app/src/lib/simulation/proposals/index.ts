/**
 * Proposal system for typed LLM response contracts.
 */

// Types
export type {
  Intensity,
  ProposedStateChange,
  ActorResourceDelta,
  WorldNumericDelta,
  WorldFactSet,
  RelationshipStrengthDelta,
  RelationshipTypeSet,
  ProposalKind,
  ActorIntentProposal,
  ChoiceEffectsProposal,
  WorldFactUpdateProposal,
} from './types';

export { isDeltaProposal, isSetProposal } from './types';

// Config
export type { ScenarioPromptConfig, ActorResponseConfig } from './config';

export {
  parsePromptConfig,
  parseActorResponseConfig,
  getEffectTypeDescriptions,
  getActorEffectTypes,
} from './config';

// Schema generation
export type {
  ValidationError,
  ProposalValidationResult,
  EntityLookupMap,
} from './schema-generator';

export {
  extractStateEntities,
  generateProposalSchema,
  generateActorIntentSchema,
  generateChoiceEffectsSchema,
  validateWithSchema,
  validateProposalsLenient,
  buildEntityLookupMap,
} from './schema-generator';
