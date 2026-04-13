import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEffects } from '../validation';
import { GOSSIP_RULESET, GOSSIP_CONSTRAINTS } from './helpers';

describe('validateEffects — unknown types rejected', () => {
  it('rejects an effect type not present in the ruleset', () => {
    const { valid, rejected } = validateEffects(
      [{ type: 'orbital_bombardment', intensity: 'major' }],
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    assert.equal(valid.length, 0);
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason, /unknown effect type/i);
  });

  it('passes effect types that exist in the ruleset', () => {
    const { valid, rejected } = validateEffects(
      [{ type: 'gossip_spread', intensity: 'minor' }],
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    assert.equal(valid.length, 1);
    assert.equal(rejected.length, 0);
  });

  it('allows unknown types when allowUnknownEffects is true', () => {
    const { valid, rejected } = validateEffects(
      [{ type: 'anything_goes', intensity: 'minor' }],
      GOSSIP_RULESET,
      { ...GOSSIP_CONSTRAINTS, allowUnknownEffects: true }
    );

    assert.equal(valid.length, 1);
    assert.equal(rejected.length, 0);
  });
});

describe('validateEffects — invalid intensity rejected', () => {
  it('rejects an effect with a bad intensity value', () => {
    const { valid, rejected } = validateEffects(
      // @ts-expect-error intentionally passing invalid intensity
      [{ type: 'gossip_spread', intensity: 'catastrophic' }],
      GOSSIP_RULESET,
      GOSSIP_CONSTRAINTS
    );

    assert.equal(valid.length, 0);
    assert.equal(rejected.length, 1);
    assert.match(rejected[0].reason, /invalid intensity/i);
  });

  it('accepts all three valid intensities', () => {
    const effects = [
      { type: 'gossip_spread', intensity: 'minor' as const },
      { type: 'gossip_spread', intensity: 'moderate' as const },
      { type: 'gossip_spread', intensity: 'major' as const },
    ];
    const { valid, rejected } = validateEffects(effects, GOSSIP_RULESET, GOSSIP_CONSTRAINTS);

    assert.equal(valid.length, 3);
    assert.equal(rejected.length, 0);
  });
});

describe('validateEffects — count limit enforced', () => {
  it('rejects effects beyond maxEffectsPerTurn (5 in gossip config)', () => {
    const effects = Array.from({ length: 7 }, (_, i) => ({
      type: i % 2 === 0 ? 'gossip_spread' : 'genuine_compliment',
      intensity: 'minor' as const,
    }));

    const { valid, rejected } = validateEffects(effects, GOSSIP_RULESET, GOSSIP_CONSTRAINTS);

    assert.equal(valid.length, 5);
    assert.equal(rejected.length, 2);
    for (const r of rejected) {
      assert.match(r.reason, /maxEffectsPerTurn/i);
    }
  });

  it('accepts exactly maxEffectsPerTurn effects', () => {
    const effects = Array.from({ length: 5 }, () => ({
      type: 'gossip_spread',
      intensity: 'minor' as const,
    }));

    const { valid, rejected } = validateEffects(effects, GOSSIP_RULESET, GOSSIP_CONSTRAINTS);

    assert.equal(valid.length, 5);
    assert.equal(rejected.length, 0);
  });
});
