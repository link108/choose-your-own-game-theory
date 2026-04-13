import type { ScenarioState } from '@/lib/types';
import type {
  SemanticEffect,
  ResolverRuleset,
  ResolverConstraints,
  ResolverResult,
  EffectResolution,
  ResourceDelta,
  ResourceCategory,
} from './types';
import { DEFAULT_CONSTRAINTS } from './constraints';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function classifyField(field: string): ResourceCategory {
  const hardFields = new Set(['gold', 'food', 'fuel', 'supply', 'population']);
  const riskFields = new Set(['threat', 'risk', 'danger', 'vulnerability']);
  if (hardFields.has(field)) return 'hard';
  if (riskFields.has(field)) return 'risk';
  return 'positional';
}

interface FieldLookup {
  currentValue: number;
  actorId?: string;
}

function lookupField(
  field: string,
  target: string | undefined,
  state: ScenarioState
): FieldLookup | null {
  // 1. World variables take priority
  const worldVar = state.worldVariables.find(
    (v) => v.name === field && v.type === 'number'
  );
  if (worldVar !== undefined) {
    const val = parseFloat(worldVar.value);
    if (!isNaN(val)) return { currentValue: val };
  }

  // 2. Actor resources (only when a target is specified)
  if (target !== undefined && target !== 'world') {
    const actor = state.actors.find(
      (a) => a.name === target || a.id === target
    );
    if (actor !== undefined) {
      const resource = actor.resources.find((r) => r.name === field);
      if (resource !== undefined) {
        return { currentValue: resource.value, actorId: actor.id };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Core resolver
// ---------------------------------------------------------------------------

export function resolveEffects(
  effects: SemanticEffect[],
  state: ScenarioState,
  ruleset: ResolverRuleset,
  constraints: ResolverConstraints = DEFAULT_CONSTRAINTS
): ResolverResult {
  const resolutions: EffectResolution[] = [];
  const rejectedEffects: ResolverResult['rejectedEffects'] = [];
  const appliedConstraints: string[] = [];
  const log: string[] = [];

  // --- Pass 1: resolve each effect individually ---
  for (const effect of effects) {
    const typeRules = ruleset[effect.type];
    if (typeRules === undefined) {
      const reason = `Unknown effect type: "${effect.type}"`;
      rejectedEffects.push({ effect, reason });
      log.push(`REJECTED ${effect.type}/${effect.intensity}: ${reason}`);
      continue;
    }

    const intensityRule = typeRules[effect.intensity];
    if (intensityRule === undefined) {
      const reason = `Unknown intensity "${effect.intensity}" for effect type "${effect.type}"`;
      rejectedEffects.push({ effect, reason });
      log.push(`REJECTED ${effect.type}/${effect.intensity}: ${reason}`);
      continue;
    }

    const deltas: ResourceDelta[] = [];
    const warnings: string[] = [];

    for (const [field, rawDelta] of Object.entries(intensityRule)) {
      const lookup = lookupField(field, effect.target, state);

      if (lookup === null) {
        const msg = `Field "${field}" not found in state — delta skipped`;
        warnings.push(msg);
        log.push(`WARN ${effect.type}/${effect.intensity}: ${msg}`);
        continue;
      }

      // Provisional finalValue (before stacking) — informational only
      const bounds = constraints.fieldBounds[field];
      const provisionalRaw = lookup.currentValue + rawDelta;
      const provisionalFinal = bounds
        ? Math.max(bounds.min, Math.min(bounds.max, provisionalRaw))
        : provisionalRaw;

      deltas.push({
        category: classifyField(field),
        field,
        actorId: lookup.actorId,
        delta: rawDelta,
        finalValue: provisionalFinal,
        reason: `${effect.type} (${effect.intensity})`,
      });
    }

    resolutions.push({ effect, deltas, warnings, clamped: false });
    log.push(
      `RESOLVED ${effect.type}/${effect.intensity}: ${deltas.length} delta(s)`
    );
  }

  // --- Pass 2: aggregate deltas by (field, actorId) ---
  type AggEntry = {
    field: string;
    actorId?: string;
    category: ResourceCategory;
    totalDelta: number;
    reasons: string[];
  };

  const deltaMap = new Map<string, AggEntry>();

  for (const resolution of resolutions) {
    for (const d of resolution.deltas) {
      const key = `${d.field}|${d.actorId ?? ''}`;
      const existing = deltaMap.get(key);
      if (existing !== undefined) {
        existing.totalDelta += d.delta;
        existing.reasons.push(d.reason);
      } else {
        deltaMap.set(key, {
          field: d.field,
          actorId: d.actorId,
          category: d.category,
          totalDelta: d.delta,
          reasons: [d.reason],
        });
      }
    }
  }

  // --- Pass 3: apply per-turn caps, compute final values ---
  const aggregatedDeltas: ResourceDelta[] = [];
  const clampedKeys = new Set<string>();

  for (const [key, agg] of deltaMap) {
    const cap = constraints.maxDeltaPerTurn[agg.field];
    let cappedDelta = agg.totalDelta;
    let clampedFrom: number | undefined;

    if (cap !== undefined && Math.abs(cappedDelta) > cap) {
      clampedFrom = cappedDelta;
      cappedDelta = Math.sign(cappedDelta) * cap;
      const msg = `"${agg.field}" per-turn delta clamped from ${clampedFrom} to ${cappedDelta} (cap: ${cap})`;
      appliedConstraints.push(msg);
      log.push(`CAPPED: ${msg}`);
      clampedKeys.add(key);
    }

    // Resolve current value for final computation
    let currentValue = 0;
    if (agg.actorId !== undefined) {
      const actor = state.actors.find((a) => a.id === agg.actorId);
      const resource = actor?.resources.find((r) => r.name === agg.field);
      if (resource !== undefined) currentValue = resource.value;
    } else {
      const worldVar = state.worldVariables.find(
        (v) => v.name === agg.field && v.type === 'number'
      );
      if (worldVar !== undefined) {
        const parsed = parseFloat(worldVar.value);
        if (!isNaN(parsed)) currentValue = parsed;
      }
    }

    const rawFinal = currentValue + cappedDelta;
    const bounds = constraints.fieldBounds[agg.field];
    let finalValue = rawFinal;

    if (bounds !== undefined) {
      if (rawFinal < bounds.min) {
        const msg = `"${agg.field}" final value ${rawFinal} clamped to min ${bounds.min}`;
        appliedConstraints.push(msg);
        log.push(`BOUNDS: ${msg}`);
        finalValue = bounds.min;
        clampedKeys.add(key);
      } else if (rawFinal > bounds.max) {
        const msg = `"${agg.field}" final value ${rawFinal} clamped to max ${bounds.max}`;
        appliedConstraints.push(msg);
        log.push(`BOUNDS: ${msg}`);
        finalValue = bounds.max;
        clampedKeys.add(key);
      }
    }

    const sign = cappedDelta >= 0 ? '+' : '';
    log.push(
      `APPLIED: ${agg.field}${agg.actorId ? ` (actor:${agg.actorId})` : ''} ${sign}${cappedDelta} → ${finalValue}`
    );

    aggregatedDeltas.push({
      category: agg.category,
      field: agg.field,
      actorId: agg.actorId,
      delta: cappedDelta,
      finalValue,
      clampedFrom,
      reason: agg.reasons.join(', '),
    });
  }

  // --- Pass 4: mark resolutions that touched clamped fields ---
  for (const resolution of resolutions) {
    if (
      resolution.deltas.some((d) =>
        clampedKeys.has(`${d.field}|${d.actorId ?? ''}`)
      )
    ) {
      resolution.clamped = true;
    }
  }

  return { resolutions, aggregatedDeltas, rejectedEffects, appliedConstraints, log };
}
