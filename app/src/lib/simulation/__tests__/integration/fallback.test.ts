/**
 * Integration: fallback behavior
 *
 * When ALL effects are rejected the engine should detect this and flag the turn
 * as a fallback. State must be unchanged and the turn must complete without error.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffects } from '../../resolver';
import { applyDelta, cloneState } from '../../state';
import { makeGossipState, GOSSIP_RULESET, GOSSIP_CONSTRAINTS } from '../../resolver/__tests__/helpers';
import type { SemanticEffect } from '../../resolver';
import type { ResolverSummary } from '@/lib/types';

/** Mirror of the fallback-detection logic used in resolveTurnWithResolver. */
function buildResolverSummaryAndFallback(
  effects: SemanticEffect[],
  ruleset: typeof GOSSIP_RULESET,
  constraints: typeof GOSSIP_CONSTRAINTS,
  state: ReturnType<typeof makeGossipState>
): { summary: ResolverSummary; isFallback: boolean } {
  const result = resolveEffects(effects, state, ruleset, constraints);

  for (const delta of result.aggregatedDeltas) {
    applyDelta(state, delta);
  }

  const isFallback =
    result.resolutions.length === 0 && result.rejectedEffects.length > 0;

  const clampedFields = [
    ...new Set(
      result.aggregatedDeltas
        .filter((d) => d.clampedFrom !== undefined)
        .map((d) => d.field)
    ),
  ];

  const summary: ResolverSummary = {
    effectsApplied: result.resolutions.map(
      (r) => `${r.effect.type} (${r.effect.intensity})`
    ),
    clamped: clampedFields,
    rejected: result.rejectedEffects.map((r) => r.effect.type),
    fallback: isFallback,
  };

  return { summary, isFallback };
}

describe('fallback behavior — all effects invalid', () => {
  it('sets fallback=true when all effects are rejected', () => {
    const state = makeGossipState();

    const effects: SemanticEffect[] = [
      { type: 'completely_made_up', intensity: 'major' },
      { type: 'another_hallucination', intensity: 'minor' },
    ];

    const { summary, isFallback } = buildResolverSummaryAndFallback(
      effects,
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS,
      state
    );

    assert.equal(isFallback, true, 'should be a fallback turn');
    assert.equal(summary.fallback, true);
    assert.equal(summary.effectsApplied.length, 0, 'no effects applied');
    assert.equal(summary.rejected.length, 2, 'both effects in rejected list');
  });

  it('does not modify state on full fallback', () => {
    const state = makeGossipState();
    const before = cloneState(state);

    const effects: SemanticEffect[] = [
      { type: 'invalid_effect_a', intensity: 'moderate' },
      { type: 'invalid_effect_b', intensity: 'major' },
    ];

    buildResolverSummaryAndFallback(effects, GOSSIP_RULESET, GOSSIP_CONSTRAINTS, state);

    // State variables must be identical
    assert.deepEqual(
      state.worldVariables.map((v) => ({ name: v.name, value: v.value })),
      before.worldVariables.map((v) => ({ name: v.name, value: v.value }))
    );
  });

  it('does NOT flag fallback when some effects are valid', () => {
    const state = makeGossipState();

    const effects: SemanticEffect[] = [
      { type: 'invalid_effect', intensity: 'minor' },     // rejected
      { type: 'reconciliation', intensity: 'minor' },     // valid
    ];

    const { isFallback } = buildResolverSummaryAndFallback(
      effects,
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS,
      state
    );

    assert.equal(isFallback, false, 'should NOT be fallback when some effects resolve');
  });

  it('does NOT flag fallback when there are no effects at all', () => {
    const state = makeGossipState();

    const { isFallback, summary } = buildResolverSummaryAndFallback(
      [],
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS,
      state
    );

    assert.equal(isFallback, false, 'empty effect list is not a fallback');
    assert.equal(summary.fallback, false);
  });
});
