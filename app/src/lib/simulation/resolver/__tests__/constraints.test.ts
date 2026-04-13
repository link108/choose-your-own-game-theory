import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEffects } from '../resolver';
import type { ResolverRuleset, ResolverConstraints } from '../types';
import { makeGossipState, GOSSIP_RULESET, GOSSIP_CONSTRAINTS } from './helpers';

describe('constraints — per-turn cap applied', () => {
  it('clamps aggregated delta that exceeds maxDeltaPerTurn', () => {
    const state = makeGossipState();
    // reputation starts at 60, cap is 35
    // gossip_spread/major: -30, gossip_spread/moderate: -15 → total -45 → capped at -35
    const result = resolveEffects(
      [
        { type: 'gossip_spread', intensity: 'major' },
        { type: 'gossip_spread', intensity: 'moderate' },
      ],
      state,
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    const repDelta = result.aggregatedDeltas.find(d => d.field === 'reputation');
    assert.ok(repDelta, 'reputation delta must exist');
    assert.equal(repDelta.delta, -35, 'delta should be capped at -35');
    assert.ok(repDelta.clampedFrom !== undefined, 'clampedFrom should be set');
    assert.equal(repDelta.clampedFrom, -45, 'uncapped delta was -45');
    assert.equal(repDelta.finalValue, 25, 'finalValue: 60 - 35 = 25');

    const capMsg = result.appliedConstraints.find(s => s.includes('reputation'));
    assert.ok(capMsg, 'appliedConstraints should mention reputation cap');
  });

  it('does not clamp when delta is within the cap', () => {
    const state = makeGossipState();
    // reputation starts at 60, cap is 35
    // gossip_spread/minor: -5 — well within cap
    const result = resolveEffects(
      [{ type: 'gossip_spread', intensity: 'minor' }],
      state,
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    const repDelta = result.aggregatedDeltas.find(d => d.field === 'reputation');
    assert.ok(repDelta);
    assert.equal(repDelta.clampedFrom, undefined);
    assert.equal(result.resolutions[0].clamped, false);
  });

  it('marks resolution.clamped = true when any field in that resolution was capped', () => {
    const state = makeGossipState();
    const result = resolveEffects(
      [
        { type: 'gossip_spread', intensity: 'major' },
        { type: 'gossip_spread', intensity: 'moderate' },
      ],
      state,
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    assert.ok(result.resolutions.some(r => r.clamped));
  });
});

describe('constraints — field bounds clamp finalValue', () => {
  it('clamps finalValue at min bound when delta pushes below zero', () => {
    const state = makeGossipState();
    // trust starts at 70, drop it by a big custom ruleset
    const tinyRuleset: ResolverRuleset = {
      trust_nuke: {
        minor:    { trust: -200 },
        moderate: { trust: -200 },
        major:    { trust: -200 },
      },
    };
    const constraints: ResolverConstraints = {
      maxDeltaPerTurn: { trust: 999 }, // no per-turn cap
      fieldBounds: { trust: { min: 0, max: 100 } },
      maxEffectsPerTurn: 10,
      allowUnknownEffects: false,
    };

    const result = resolveEffects(
      [{ type: 'trust_nuke', intensity: 'minor' }],
      state,
      tinyRuleset,
      constraints
    );

    const trustDelta = result.aggregatedDeltas.find(d => d.field === 'trust');
    assert.ok(trustDelta);
    assert.equal(trustDelta.finalValue, 0);
    const boundsMsg = result.appliedConstraints.find(s => s.includes('trust') && s.includes('min'));
    assert.ok(boundsMsg, 'should log bounds clamping');
  });

  it('clamps finalValue at max bound when delta pushes above 100', () => {
    const state = makeGossipState();
    // reputation starts at 60
    const tinyRuleset: ResolverRuleset = {
      fame_explosion: {
        minor:    { reputation: 999 },
        moderate: { reputation: 999 },
        major:    { reputation: 999 },
      },
    };
    const constraints: ResolverConstraints = {
      maxDeltaPerTurn: {},
      fieldBounds: { reputation: { min: 0, max: 100 } },
      maxEffectsPerTurn: 10,
      allowUnknownEffects: false,
    };

    const result = resolveEffects(
      [{ type: 'fame_explosion', intensity: 'minor' }],
      state,
      tinyRuleset,
      constraints
    );

    const repDelta = result.aggregatedDeltas.find(d => d.field === 'reputation');
    assert.ok(repDelta);
    assert.equal(repDelta.finalValue, 100);
  });

  it('applies no bounds when field has no entry in fieldBounds', () => {
    // Use a custom field "chaos" with no bounds defined
    const state = makeGossipState();
    const tinyRuleset: ResolverRuleset = {
      chaos_event: {
        minor:    { trust: 500 },
        moderate: { trust: 500 },
        major:    { trust: 500 },
      },
    };
    const constraints: ResolverConstraints = {
      maxDeltaPerTurn: {},
      fieldBounds: {}, // no bounds on trust for this test
      maxEffectsPerTurn: 10,
      allowUnknownEffects: false,
    };

    const result = resolveEffects(
      [{ type: 'chaos_event', intensity: 'minor' }],
      state,
      tinyRuleset,
      constraints
    );

    const trustDelta = result.aggregatedDeltas.find(d => d.field === 'trust');
    assert.ok(trustDelta);
    assert.equal(trustDelta.finalValue, 570); // 70 + 500, unclamped
  });
});

describe('constraints — config.ts parses scenario resolverConfig', () => {
  it('getRuleset returns empty object for null config', async () => {
    const { getRuleset } = await import('../config');
    const ruleset = getRuleset(null);
    assert.deepEqual(ruleset, {});
  });

  it('getConstraints merges scenario overrides on top of defaults', async () => {
    const { getConstraints } = await import('../config');
    const raw = {
      ruleset: { some_effect: { minor: { mood: 5 }, moderate: { mood: 10 }, major: { mood: 20 } } },
      constraints: {
        maxDeltaPerTurn: { mood: 15 },
        fieldBounds: { mood: { min: 0, max: 50 } },
        maxEffectsPerTurn: 3,
      },
    };
    const constraints = getConstraints(raw);
    assert.equal(constraints.maxEffectsPerTurn, 3);
    assert.equal(constraints.maxDeltaPerTurn.mood, 15);
    assert.deepEqual(constraints.fieldBounds.mood, { min: 0, max: 50 });
  });
});
