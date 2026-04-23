export type {
  EffectIntensity,
  SemanticEffect,
  ResourceCategory,
  ResourceDelta,
  EffectResolution,
  RejectedEffect,
  ResolverResult,
  ResolverRuleset,
  ResolverConstraints,
  // Proposal-based types
  ProposalResolution,
  RejectedProposal,
  ProposalResolverResult,
} from './types';

export { DEFAULT_INTENSITY_DELTAS } from './types';

export type { ScenarioResolverConfig } from './config';

export { DEFAULT_CONSTRAINTS } from './constraints';
export { parseResolverConfig, getRuleset, getConstraints } from './config';
export { resolveEffects, resolveProposals } from './resolver';
export { validateEffects } from './validation';
