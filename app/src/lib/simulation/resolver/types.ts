import type { ProposedStateChange, Intensity } from '../proposals/types';

export type EffectIntensity = 'minor' | 'moderate' | 'major';

export interface SemanticEffect {
  type: string;
  intensity: EffectIntensity;
  scope?: string;
  target?: string;
}

export type ResourceCategory = 'hard' | 'positional' | 'risk';

export interface ResourceDelta {
  category: ResourceCategory;
  field: string;
  actorId?: string;
  delta: number;
  finalValue: number;
  clampedFrom?: number;
  reason: string;
}

export interface EffectResolution {
  effect: SemanticEffect;
  deltas: ResourceDelta[];
  warnings: string[];
  clamped: boolean;
}

export interface RejectedEffect {
  effect: SemanticEffect;
  reason: string;
}

export interface ResolverResult {
  resolutions: EffectResolution[];
  aggregatedDeltas: ResourceDelta[];
  rejectedEffects: RejectedEffect[];
  appliedConstraints: string[];
  log: string[];
}

/** effectType → intensity → fieldName → numeric delta */
export type ResolverRuleset = Record<string, Record<string, Record<string, number>>>;

export interface ResolverConstraints {
  maxDeltaPerTurn: Record<string, number>;
  fieldBounds: Record<string, { min: number; max: number }>;
  maxEffectsPerTurn: number;
  allowUnknownEffects: boolean;
}

// ---------------------------------------------------------------------------
// Proposal-based resolution types
// ---------------------------------------------------------------------------

/**
 * Resolution result for a single proposal.
 */
export interface ProposalResolution {
  proposal: ProposedStateChange;
  deltas: ResourceDelta[];
  warnings: string[];
  clamped: boolean;
}

/**
 * A rejected proposal with reason.
 */
export interface RejectedProposal {
  proposal: ProposedStateChange;
  reason: string;
}

/**
 * Result of resolving proposals.
 */
export interface ProposalResolverResult {
  resolutions: ProposalResolution[];
  aggregatedDeltas: ResourceDelta[];
  rejectedProposals: RejectedProposal[];
  appliedConstraints: string[];
  log: string[];
}

/**
 * Default intensity multipliers for proposal kinds.
 * Maps kind -> intensity -> base delta multiplier
 */
export const DEFAULT_INTENSITY_DELTAS: Record<string, Record<Intensity, number>> = {
  actor_resource_delta: {
    minor: 5,
    moderate: 15,
    major: 30,
  },
  world_numeric_delta: {
    minor: 5,
    moderate: 15,
    major: 30,
  },
  relationship_strength_delta: {
    minor: 5,
    moderate: 15,
    major: 25,
  },
};
