/**
 * Configuration interfaces for scenario-specific LLM prompt customization.
 */

import type { Intensity } from './types';

/**
 * Scenario-level prompt configuration.
 * Stored in Scenario.promptConfig (JSON field).
 */
export interface ScenarioPromptConfig {
  /**
   * Effect type vocabulary with human-readable descriptions.
   * These descriptions are included in prompts to guide the LLM.
   * Example: { "gossip_spread": "Spread rumors about someone, damaging their reputation" }
   */
  effectTypeDescriptions: Record<string, string>;

  /**
   * Which state fields to emphasize in prompts (e.g., "reputation", "gold").
   */
  stateEmphasis: string[];

  /**
   * Additional scenario-specific guidance for the LLM.
   */
  scenarioContext: string;

  /**
   * Intensity mappings for proposal kinds.
   * Maps: proposalKind -> resourceId -> intensity -> delta value
   * Example:
   * {
   *   "actor_resource_delta": {
   *     "reputation": { "minor": -5, "moderate": -15, "major": -30 }
   *   }
   * }
   */
  intensityMappings?: Record<string, Record<string, Record<Intensity, number>>>;
}

/**
 * Actor-level response configuration.
 * Stored in Actor.responseConfig (JSON field).
 */
export interface ActorResponseConfig {
  /**
   * Subset of effect types this actor can propose.
   * Empty array means all effect types are available.
   */
  availableEffectTypes: string[];

  /**
   * Resources this actor prioritizes in their decision-making.
   */
  resourcePriorities: string[];

  /**
   * Personality/style guidance for this actor's responses.
   */
  responseHints: string;
}

// ---------------------------------------------------------------------------
// Parsing utilities
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!isRecord(v)) return false;
  for (const val of Object.values(v)) {
    if (typeof val !== 'string') return false;
  }
  return true;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * Parse a raw Scenario.promptConfig JSON value.
 * Returns null if invalid or missing.
 */
export function parsePromptConfig(raw: unknown): ScenarioPromptConfig | null {
  if (!isRecord(raw)) return null;

  const effectTypeDescriptions = isStringRecord(raw.effectTypeDescriptions)
    ? raw.effectTypeDescriptions
    : {};

  const stateEmphasis = isStringArray(raw.stateEmphasis)
    ? raw.stateEmphasis
    : [];

  const scenarioContext =
    typeof raw.scenarioContext === 'string' ? raw.scenarioContext : '';

  // Parse intensity mappings if present
  let intensityMappings: ScenarioPromptConfig['intensityMappings'] | undefined;
  if (isRecord(raw.intensityMappings)) {
    intensityMappings = {};
    for (const [kind, resourceMap] of Object.entries(raw.intensityMappings)) {
      if (!isRecord(resourceMap)) continue;
      intensityMappings[kind] = {};
      for (const [resourceId, intensityMap] of Object.entries(resourceMap)) {
        if (!isRecord(intensityMap)) continue;
        const parsed: Record<Intensity, number> = {
          minor: 0,
          moderate: 0,
          major: 0,
        };
        for (const intensity of ['minor', 'moderate', 'major'] as const) {
          if (typeof intensityMap[intensity] === 'number') {
            parsed[intensity] = intensityMap[intensity] as number;
          }
        }
        intensityMappings[kind][resourceId] = parsed;
      }
    }
  }

  return {
    effectTypeDescriptions,
    stateEmphasis,
    scenarioContext,
    intensityMappings,
  };
}

/**
 * Parse a raw Actor.responseConfig JSON value.
 * Returns null if invalid or missing.
 */
export function parseActorResponseConfig(
  raw: unknown
): ActorResponseConfig | null {
  if (!isRecord(raw)) return null;

  const availableEffectTypes = isStringArray(raw.availableEffectTypes)
    ? raw.availableEffectTypes
    : [];

  const resourcePriorities = isStringArray(raw.resourcePriorities)
    ? raw.resourcePriorities
    : [];

  const responseHints =
    typeof raw.responseHints === 'string' ? raw.responseHints : '';

  return {
    availableEffectTypes,
    resourcePriorities,
    responseHints,
  };
}

/**
 * Get effect type descriptions for prompt building.
 * Merges scenario-level descriptions with effect types from resolver config.
 */
export function getEffectTypeDescriptions(
  promptConfig: ScenarioPromptConfig | null,
  effectTypes: string[]
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const effectType of effectTypes) {
    result[effectType] =
      promptConfig?.effectTypeDescriptions[effectType] ?? effectType;
  }

  return result;
}

/**
 * Filter effect types available to a specific actor.
 */
export function getActorEffectTypes(
  allEffectTypes: string[],
  actorConfig: ActorResponseConfig | null
): string[] {
  if (!actorConfig || actorConfig.availableEffectTypes.length === 0) {
    return allEffectTypes;
  }

  // Intersect actor's available types with scenario's types
  const available = new Set(actorConfig.availableEffectTypes);
  return allEffectTypes.filter((t) => available.has(t));
}
