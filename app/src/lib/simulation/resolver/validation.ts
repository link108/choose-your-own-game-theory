import type {
  SemanticEffect,
  ResolverRuleset,
  ResolverConstraints,
  RejectedEffect,
} from './types';

const VALID_INTENSITIES = new Set<string>(['minor', 'moderate', 'major']);

/**
 * Validate a list of SemanticEffects before resolution.
 *
 * Checks performed (in order):
 * 1. Count limit — effects beyond maxEffectsPerTurn are rejected first
 * 2. Invalid intensity value
 * 3. Unknown effect type (unless allowUnknownEffects is true)
 */
export function validateEffects(
  effects: SemanticEffect[],
  ruleset: ResolverRuleset,
  constraints: ResolverConstraints
): { valid: SemanticEffect[]; rejected: RejectedEffect[] } {
  const valid: SemanticEffect[] = [];
  const rejected: RejectedEffect[] = [];

  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];

    // 1. Count limit
    if (i >= constraints.maxEffectsPerTurn) {
      rejected.push({
        effect,
        reason: `Effect count exceeds maxEffectsPerTurn (${constraints.maxEffectsPerTurn})`,
      });
      continue;
    }

    // 2. Invalid intensity
    if (!VALID_INTENSITIES.has(effect.intensity)) {
      rejected.push({
        effect,
        reason: `Invalid intensity: "${effect.intensity}" — must be minor | moderate | major`,
      });
      continue;
    }

    // 3. Unknown effect type
    if (ruleset[effect.type] === undefined && !constraints.allowUnknownEffects) {
      rejected.push({
        effect,
        reason: `Unknown effect type: "${effect.type}"`,
      });
      continue;
    }

    valid.push(effect);
  }

  return { valid, rejected };
}
