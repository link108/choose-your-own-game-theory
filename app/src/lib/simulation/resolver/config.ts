import type { ResolverRuleset, ResolverConstraints } from './types';
import { DEFAULT_CONSTRAINTS } from './constraints';

/**
 * Shape expected inside Scenario.resolverConfig (a Json? field in Prisma).
 *
 * Example — a gossip scenario:
 * {
 *   "ruleset": {
 *     "gossip_spread": {
 *       "minor":    { "reputation": -5,  "trust": -3 },
 *       "moderate": { "reputation": -15, "trust": -8 },
 *       "major":    { "reputation": -30, "trust": -15 }
 *     },
 *     "genuine_compliment": {
 *       "minor":    { "rapport": 5 },
 *       "moderate": { "rapport": 12 },
 *       "major":    { "rapport": 20 }
 *     }
 *   },
 *   "constraints": {
 *     "maxDeltaPerTurn": { "reputation": 40, "trust": 30, "rapport": 25 },
 *     "fieldBounds": {
 *       "reputation": { "min": 0, "max": 100 },
 *       "trust":      { "min": 0, "max": 100 },
 *       "rapport":    { "min": 0, "max": 100 }
 *     },
 *     "maxEffectsPerTurn": 8
 *   }
 * }
 *
 * The field names ("reputation", "trust", "rapport") are entirely up to the
 * scenario author — they should match the WorldVariable or ActorResource names
 * used in that scenario.
 */
export interface ScenarioResolverConfig {
  ruleset: ResolverRuleset;
  constraints?: Partial<ResolverConstraints>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseRuleset(raw: unknown): ResolverRuleset | null {
  if (!isRecord(raw)) return null;

  const ruleset: ResolverRuleset = {};

  for (const [effectType, intensities] of Object.entries(raw)) {
    if (!isRecord(intensities)) continue;
    ruleset[effectType] = {};

    for (const [intensity, fields] of Object.entries(intensities)) {
      if (!isRecord(fields)) continue;
      ruleset[effectType][intensity] = {};

      for (const [field, delta] of Object.entries(fields)) {
        if (typeof delta === 'number') {
          ruleset[effectType][intensity][field] = delta;
        }
      }
    }
  }

  return ruleset;
}

function parseConstraints(raw: unknown): Partial<ResolverConstraints> {
  if (!isRecord(raw)) return {};

  const out: Partial<ResolverConstraints> = {};

  if (isRecord(raw.maxDeltaPerTurn)) {
    const map: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw.maxDeltaPerTurn)) {
      if (typeof v === 'number') map[k] = v;
    }
    out.maxDeltaPerTurn = map;
  }

  if (isRecord(raw.fieldBounds)) {
    const bounds: Record<string, { min: number; max: number }> = {};
    for (const [field, b] of Object.entries(raw.fieldBounds)) {
      if (isRecord(b) && typeof b.min === 'number' && typeof b.max === 'number') {
        bounds[field] = { min: b.min, max: b.max };
      }
    }
    out.fieldBounds = bounds;
  }

  if (typeof raw.maxEffectsPerTurn === 'number') {
    out.maxEffectsPerTurn = raw.maxEffectsPerTurn;
  }

  if (typeof raw.allowUnknownEffects === 'boolean') {
    out.allowUnknownEffects = raw.allowUnknownEffects;
  }

  return out;
}

/**
 * Parse and validate a raw Scenario.resolverConfig value.
 * Returns null if the config is missing or malformed.
 */
export function parseResolverConfig(raw: unknown): ScenarioResolverConfig | null {
  if (!isRecord(raw)) return null;

  const ruleset = parseRuleset(raw.ruleset);
  if (ruleset === null) return null;

  return {
    ruleset,
    constraints: parseConstraints(raw.constraints),
  };
}

/**
 * Extract the ruleset from a scenario's resolverConfig.
 * Returns an empty ruleset if the config is absent or malformed.
 */
export function getRuleset(scenarioResolverConfig: unknown): ResolverRuleset {
  const config = parseResolverConfig(scenarioResolverConfig);
  return config?.ruleset ?? {};
}

/**
 * Build effective ResolverConstraints for a scenario by merging scenario-level
 * overrides on top of DEFAULT_CONSTRAINTS.
 */
export function getConstraints(
  scenarioResolverConfig: unknown
): ResolverConstraints {
  const config = parseResolverConfig(scenarioResolverConfig);
  if (!config?.constraints) return DEFAULT_CONSTRAINTS;

  return {
    ...DEFAULT_CONSTRAINTS,
    ...config.constraints,
    // Deep-merge the map fields so partial overrides don't wipe defaults
    maxDeltaPerTurn: {
      ...DEFAULT_CONSTRAINTS.maxDeltaPerTurn,
      ...config.constraints.maxDeltaPerTurn,
    },
    fieldBounds: {
      ...DEFAULT_CONSTRAINTS.fieldBounds,
      ...config.constraints.fieldBounds,
    },
  };
}
