import type { ResolverConstraints } from './types';

/**
 * Baseline constraints with no field-specific assumptions.
 *
 * Scenarios define their own field names, bounds, and per-turn caps inside
 * Scenario.resolverConfig — this default is intentionally domain-agnostic.
 */
export const DEFAULT_CONSTRAINTS: ResolverConstraints = {
  maxDeltaPerTurn: {},
  fieldBounds: {},
  maxEffectsPerTurn: 10,
  allowUnknownEffects: false,
};
