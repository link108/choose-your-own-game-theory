import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffects } from '../resolver';
import { makeGossipState, GOSSIP_RULESET, GOSSIP_CONSTRAINTS } from './helpers';

describe('resolveEffects — known effects produce correct deltas', () => {
  it('applies a single minor gossip_spread effect', () => {
    const state = makeGossipState();
    // reputation starts at 60, trust at 70
    const result = resolveEffects(
      [{ type: 'gossip_spread', intensity: 'minor' }],
      state,
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    assert.equal(result.rejectedEffects.length, 0);
    assert.equal(result.resolutions.length, 1);

    const repDelta = result.aggregatedDeltas.find(d => d.field === 'reputation');
    const trustDelta = result.aggregatedDeltas.find(d => d.field === 'trust');

    assert.ok(repDelta, 'should have reputation delta');
    assert.equal(repDelta.delta, -5);
    assert.equal(repDelta.finalValue, 55);   // 60 + (-5)

    assert.ok(trustDelta, 'should have trust delta');
    assert.equal(trustDelta.delta, -3);
    assert.equal(trustDelta.finalValue, 67); // 70 + (-3)
  });

  it('applies a major genuine_compliment effect', () => {
    const state = makeGossipState();
    // reputation starts at 60
    const result = resolveEffects(
      [{ type: 'genuine_compliment', intensity: 'major' }],
      state,
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    const repDelta = result.aggregatedDeltas.find(d => d.field === 'reputation');
    assert.ok(repDelta);
    assert.equal(repDelta.delta, 20);
    assert.equal(repDelta.finalValue, 80); // 60 + 20
  });

  it('rejects an unknown effect type', () => {
    const state = makeGossipState();
    const result = resolveEffects(
      [{ type: 'nuclear_launch', intensity: 'major' }],
      state,
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    assert.equal(result.rejectedEffects.length, 1);
    assert.match(result.rejectedEffects[0].reason, /unknown effect type/i);
    assert.equal(result.aggregatedDeltas.length, 0);
  });
});

describe('resolveEffects — deltas stack correctly across multiple effects on the same field', () => {
  it('sums trust deltas from two effects', () => {
    const state = makeGossipState();
    // trust starts at 70
    // gossip_spread/minor: trust -3
    // genuine_compliment/minor: trust +3
    // net: 0
    const result = resolveEffects(
      [
        { type: 'gossip_spread',      intensity: 'minor' },
        { type: 'genuine_compliment', intensity: 'minor' },
      ],
      state,
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    assert.equal(result.resolutions.length, 2);

    const trustDelta = result.aggregatedDeltas.find(d => d.field === 'trust');
    assert.ok(trustDelta);
    assert.equal(trustDelta.delta, 0);       // -3 + 3
    assert.equal(trustDelta.finalValue, 70); // 70 + 0
  });

  it('sums reputation deltas from two negative effects', () => {
    const state = makeGossipState();
    // reputation starts at 60
    // gossip_spread/minor: -5, gossip_spread/moderate: -15 → total -20
    const result = resolveEffects(
      [
        { type: 'gossip_spread', intensity: 'minor' },
        { type: 'gossip_spread', intensity: 'moderate' },
      ],
      state,
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    const repDelta = result.aggregatedDeltas.find(d => d.field === 'reputation');
    assert.ok(repDelta);
    assert.equal(repDelta.delta, -20);
    assert.equal(repDelta.finalValue, 40); // 60 - 20
  });

  it('logs an entry for each applied delta', () => {
    const state = makeGossipState();
    const result = resolveEffects(
      [{ type: 'public_argument', intensity: 'moderate' }],
      state,
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    const appliedLogs = result.log.filter(l => l.startsWith('APPLIED'));
    assert.ok(appliedLogs.length >= 2, 'should log tension and trust');
  });
});
