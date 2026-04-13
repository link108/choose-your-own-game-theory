/**
 * Integration: effect rejection
 *
 * When the LLM produces unknown effect types the resolver rejects them.
 * State must remain unchanged and the turn must complete without error.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffects } from '../../resolver';
import { applyDelta, cloneState } from '../../state';
import { makeGossipState, GOSSIP_RULESET, GOSSIP_CONSTRAINTS } from '../../resolver/__tests__/helpers';
import type { SemanticEffect } from '../../resolver';

describe('resolver rejection — unknown effect types', () => {
  it('rejects all unknown types, applies no deltas, state unchanged', () => {
    const state = makeGossipState();
    const before = cloneState(state);

    const effects: SemanticEffect[] = [
      { type: 'nuclear_launch', intensity: 'major' },
      { type: 'dragon_summoning', intensity: 'moderate' },
    ];

    const result = resolveEffects(effects, state, GOSSIP_RULESET, GOSSIP_CONSTRAINTS);

    assert.equal(result.resolutions.length, 0, 'no successful resolutions');
    assert.equal(result.rejectedEffects.length, 2, 'both effects rejected');
    assert.equal(result.aggregatedDeltas.length, 0, 'no deltas to apply');

    // No deltas → state should be unchanged
    for (const delta of result.aggregatedDeltas) {
      applyDelta(state, delta);
    }

    // Verify state is identical to before
    assert.deepEqual(
      state.worldVariables.map((v) => ({ name: v.name, value: v.value })),
      before.worldVariables.map((v) => ({ name: v.name, value: v.value }))
    );
    assert.deepEqual(
      state.actors.map((a) => a.resources.map((r) => ({ name: r.name, value: r.value }))),
      before.actors.map((a) => a.resources.map((r) => ({ name: r.name, value: r.value })))
    );
  });

  it('rejects unknown effects but applies known ones in the same batch', () => {
    const state = makeGossipState();
    // reputation = 60

    const effects: SemanticEffect[] = [
      { type: 'unknown_effect_type', intensity: 'major' },  // rejected
      { type: 'genuine_compliment', intensity: 'minor' },   // accepted: reputation +5
    ];

    const result = resolveEffects(effects, state, GOSSIP_RULESET, GOSSIP_CONSTRAINTS);

    assert.equal(result.rejectedEffects.length, 1, 'one effect rejected');
    assert.equal(result.rejectedEffects[0].effect.type, 'unknown_effect_type');
    assert.equal(result.resolutions.length, 1, 'one resolution succeeded');
    assert.ok(result.aggregatedDeltas.length > 0, 'has deltas from the valid effect');

    for (const delta of result.aggregatedDeltas) {
      applyDelta(state, delta);
    }

    // reputation should still increase by 5 from genuine_compliment/minor
    const repVar = state.worldVariables.find((v) => v.name === 'reputation');
    assert.equal(repVar?.value, '65', 'reputation should increase despite partial rejection');
  });

  it('rejection reason mentions unknown effect type', () => {
    const state = makeGossipState();

    const effects: SemanticEffect[] = [
      { type: 'hallucinated_effect', intensity: 'minor' },
    ];

    const result = resolveEffects(effects, state, GOSSIP_RULESET, GOSSIP_CONSTRAINTS);

    assert.equal(result.rejectedEffects.length, 1);
    assert.match(result.rejectedEffects[0].reason, /unknown effect type/i);
  });
});
