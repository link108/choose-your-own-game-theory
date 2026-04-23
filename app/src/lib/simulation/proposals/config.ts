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
