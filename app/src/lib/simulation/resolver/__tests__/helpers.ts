import type { ScenarioState } from '@/lib/types';
import type { ResolverRuleset, ResolverConstraints } from '../types';

/**
 * Minimal ScenarioState for resolver tests.
 * Fields are intentionally domain-agnostic: reputation, trust, rapport.
 * This could represent a gossip sim, an office politics sim, etc.
 */
export function makeGossipState(): ScenarioState {
  return {
    scenarioId: 'test-scenario',
    sessionId: 'test-session',
    turn: 1,
    actors: [
      {
        id: 'actor-alice',
        name: 'Alice',
        description: 'A colleague',
        goals: [],
        traits: [],
        isPlayer: true,
        resources: [
          { id: 'r1', name: 'rapport', value: 50, minValue: 0, maxValue: 100 },
        ],
      },
    ],
    relationships: [],
    worldVariables: [
      { id: 'wv1', name: 'reputation', value: '60', type: 'number', minValue: '0', maxValue: '100' },
      { id: 'wv2', name: 'trust',      value: '70', type: 'number', minValue: '0', maxValue: '100' },
      { id: 'wv3', name: 'tension',    value: '20', type: 'number', minValue: '0', maxValue: '100' },
    ],
    eventHistory: [],
  };
}

/** Ruleset for the gossip scenario — entirely user-defined, not hardcoded. */
export const GOSSIP_RULESET: ResolverRuleset = {
  gossip_spread: {
    minor:    { reputation: -5,  trust: -3 },
    moderate: { reputation: -15, trust: -8 },
    major:    { reputation: -30, trust: -15 },
  },
  genuine_compliment: {
    minor:    { reputation: 5,  trust: 3 },
    moderate: { reputation: 10, trust: 8 },
    major:    { reputation: 20, trust: 15 },
  },
  public_argument: {
    minor:    { tension: 10, trust: -5 },
    moderate: { tension: 20, trust: -12 },
    major:    { tension: 35, trust: -20 },
  },
  reconciliation: {
    minor:    { tension: -8,  trust: 5 },
    moderate: { tension: -18, trust: 12 },
    major:    { tension: -30, trust: 20 },
  },
};

export const GOSSIP_CONSTRAINTS: ResolverConstraints = {
  maxDeltaPerTurn: {
    reputation: 35,
    trust: 25,
    tension: 40,
  },
  fieldBounds: {
    reputation: { min: 0, max: 100 },
    trust:      { min: 0, max: 100 },
    tension:    { min: 0, max: 100 },
  },
  maxEffectsPerTurn: 5,
  allowUnknownEffects: false,
};

/** Salary negotiation ruleset — another domain entirely. */
export const SALARY_RULESET: ResolverRuleset = {
  strong_case_made: {
    minor:    { leverage: 5,  goodwill: 2 },
    moderate: { leverage: 15, goodwill: 5 },
    major:    { leverage: 30, goodwill: 10 },
  },
  awkward_timing: {
    minor:    { leverage: -5,  goodwill: -3 },
    moderate: { leverage: -15, goodwill: -8 },
    major:    { leverage: -30, goodwill: -15 },
  },
};
