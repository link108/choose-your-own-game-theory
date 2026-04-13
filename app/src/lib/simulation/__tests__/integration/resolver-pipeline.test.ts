/**
 * Integration: full resolver pipeline
 *
 * Simulates the core of resolveTurnWithResolver without calling the LLM:
 * manually supply SemanticEffects, run them through the resolver, apply the
 * resulting deltas, and assert the state changes are correct.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffects } from '../../resolver';
import { applyDelta } from '../../state';
import { makeGossipState, GOSSIP_RULESET, GOSSIP_CONSTRAINTS } from '../../resolver/__tests__/helpers';
import type { SemanticEffect, ResolverResult } from '../../resolver';
import type { StateChange } from '@/lib/types';

describe('resolver pipeline integration — effects → resolver → state', () => {
  it('applies moderate gossip_spread correctly end-to-end', () => {
    const state = makeGossipState();
    // reputation = 60, trust = 70

    const effects: SemanticEffect[] = [
      { type: 'gossip_spread', intensity: 'moderate' },
    ];

    const result: ResolverResult = resolveEffects(effects, state, GOSSIP_RULESET, GOSSIP_CONSTRAINTS);

    assert.equal(result.rejectedEffects.length, 0, 'no effects should be rejected');
    assert.equal(result.aggregatedDeltas.length, 2, 'reputation and trust deltas');

    const stateChanges: StateChange[] = [];
    for (const delta of result.aggregatedDeltas) {
      const change = applyDelta(state, delta);
      if (change) stateChanges.push(change);
    }

    assert.equal(stateChanges.length, 2);

    const repVar = state.worldVariables.find((v) => v.name === 'reputation');
    const trustVar = state.worldVariables.find((v) => v.name === 'trust');

    // gossip_spread moderate: reputation -15 → 45, trust -8 → 62
    assert.equal(repVar?.value, '45', 'reputation should drop by 15');
    assert.equal(trustVar?.value, '62', 'trust should drop by 8');
  });

  it('stacks player and actor effects correctly', () => {
    const state = makeGossipState();
    // reputation = 60

    const effects: SemanticEffect[] = [
      { type: 'gossip_spread', intensity: 'minor' },       // reputation -5
      { type: 'genuine_compliment', intensity: 'minor' },  // reputation +5, trust +3
    ];

    const result = resolveEffects(effects, state, GOSSIP_RULESET, GOSSIP_CONSTRAINTS);

    assert.equal(result.rejectedEffects.length, 0);

    // Net reputation: -5 + 5 = 0 → stays at 60
    const repDelta = result.aggregatedDeltas.find((d) => d.field === 'reputation');
    assert.ok(repDelta, 'should have reputation delta');
    assert.equal(repDelta.delta, 0);
    assert.equal(repDelta.finalValue, 60);

    for (const delta of result.aggregatedDeltas) {
      applyDelta(state, delta);
    }

    const repVar = state.worldVariables.find((v) => v.name === 'reputation');
    assert.equal(repVar?.value, '60', 'reputation unchanged after offsetting effects');
  });

  it('persists resolverLog fields (resolutions, rejectedEffects, appliedConstraints)', () => {
    const state = makeGossipState();

    const effects: SemanticEffect[] = [
      { type: 'public_argument', intensity: 'major' },
    ];

    const result = resolveEffects(effects, state, GOSSIP_RULESET, GOSSIP_CONSTRAINTS);

    assert.equal(result.resolutions.length, 1);
    assert.equal(result.rejectedEffects.length, 0);
    assert.ok(Array.isArray(result.appliedConstraints));
    assert.ok(Array.isArray(result.log));
    assert.ok(result.log.length > 0, 'should have log entries');
  });

  it('builds correct StateChange records from deltas', () => {
    const state = makeGossipState();

    const effects: SemanticEffect[] = [
      { type: 'reconciliation', intensity: 'moderate' },
    ];

    const result = resolveEffects(effects, state, GOSSIP_RULESET, GOSSIP_CONSTRAINTS);

    const stateChanges: StateChange[] = [];
    for (const delta of result.aggregatedDeltas) {
      const change = applyDelta(state, delta);
      if (change) stateChanges.push(change);
    }

    // reconciliation moderate: tension -18, trust +12
    const tensionChange = stateChanges.find((c) => c.target === 'tension' || c.field === 'tension');
    const trustChange = stateChanges.find((c) => c.target === 'trust' || c.field === 'trust');

    assert.ok(tensionChange, 'should have tension change');
    assert.ok(trustChange, 'should have trust change');

    // Both should have type worldVariable (they are world variables in makeGossipState)
    assert.equal(tensionChange.type, 'worldVariable');
    assert.equal(trustChange.type, 'worldVariable');
  });
});
