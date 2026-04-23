import type { ScenarioState } from '@/lib/types';
import type {
  SemanticEffect,
  ResolverRuleset,
  ResolverConstraints,
  ResolverResult,
  EffectResolution,
  ResourceDelta,
  ResourceCategory,
  ProposalResolverResult,
  ProposalResolution,
  RejectedProposal,
} from './types';
import { DEFAULT_INTENSITY_DELTAS } from './types';
import { DEFAULT_CONSTRAINTS } from './constraints';
import type {
  ProposedStateChange,
  Intensity,
} from '../proposals/types';
import type { ScenarioPromptConfig } from '../proposals/config';

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
  fieldName: string;
}

const NUMERIC_KINDS = new Set(['resource', 'countdown', 'counter']);

function lookupField(
  field: string,
  target: string | undefined,
  state: ScenarioState
): FieldLookup | null {
  // 1. World variables take priority (numeric kinds only)
  const worldVar = state.worldVariables.find(
    (v) => v.name === field && NUMERIC_KINDS.has(v.kind)
  );
  if (worldVar !== undefined) {
    const val = parseFloat(worldVar.value);
    if (!isNaN(val)) return { currentValue: val, fieldName: field };
  }

  // 2. Actor resources — use named target, or fall back to the player actor
  const actor =
    target !== undefined && target !== 'world'
      ? state.actors.find((a) => a.name === target || a.id === target)
      : state.actors.find((a) => a.isPlayer);

  if (actor !== undefined) {
    const resource = actor.resources.find((r) => r.name === field);
    if (resource !== undefined) {
      return { currentValue: resource.value, actorId: actor.id, fieldName: field };
    }
  }

  return null;
}

/**
 * Lookup by ID for proposal-based resolution.
 */
function lookupActorResource(
  actorId: string,
  resourceId: string,
  state: ScenarioState
): FieldLookup | null {
  const actor = state.actors.find((a) => a.id === actorId);
  if (!actor) return null;

  const resource = actor.resources.find((r) => r.id === resourceId);
  if (!resource) return null;

  return {
    currentValue: resource.value,
    actorId: actor.id,
    fieldName: resource.name,
  };
}

function lookupWorldVariable(
  variableId: string,
  state: ScenarioState
): { currentValue: number; fieldName: string } | null {
  const variable = state.worldVariables.find(
    (v) => v.id === variableId && NUMERIC_KINDS.has(v.kind)
  );
  if (!variable) return null;

  const val = parseFloat(variable.value);
  if (isNaN(val)) return null;

  return { currentValue: val, fieldName: variable.name };
}

function lookupRelationship(
  relationshipId: string,
  state: ScenarioState
): { currentValue: number; fromActorId: string; toActorId: string } | null {
  const rel = state.relationships.find((r) => r.id === relationshipId);
  if (!rel) return null;

  return {
    currentValue: rel.strength,
    fromActorId: rel.fromActorId,
    toActorId: rel.toActorId,
  };
}

/**
 * Get delta value for an intensity level, optionally from prompt config.
 */
function getIntensityDelta(
  kind: string,
  resourceId: string,
  intensity: Intensity,
  promptConfig?: ScenarioPromptConfig | null
): number {
  // First check prompt config for custom mappings
  const customMapping = promptConfig?.intensityMappings?.[kind]?.[resourceId]?.[intensity];
  if (customMapping !== undefined) {
    return customMapping;
  }

  // Fall back to defaults
  return DEFAULT_INTENSITY_DELTAS[kind]?.[intensity] ?? 10;
}

// ---------------------------------------------------------------------------
// Legacy SemanticEffect resolver
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
  const aggregatedDeltas = aggregateAndClamp(resolutions, state, constraints, appliedConstraints, log);

  // --- Pass 3: mark resolutions that touched clamped fields ---
  const clampedKeys = new Set(
    aggregatedDeltas.filter((d) => d.clampedFrom !== undefined).map((d) => `${d.field}|${d.actorId ?? ''}`)
  );
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

// ---------------------------------------------------------------------------
// Proposal-based resolver
// ---------------------------------------------------------------------------

/**
 * Resolve ProposedStateChange[] to ResourceDeltas.
 */
export function resolveProposals(
  proposals: ProposedStateChange[],
  state: ScenarioState,
  constraints: ResolverConstraints = DEFAULT_CONSTRAINTS,
  promptConfig?: ScenarioPromptConfig | null
): ProposalResolverResult {
  const resolutions: ProposalResolution[] = [];
  const rejectedProposals: RejectedProposal[] = [];
  const appliedConstraints: string[] = [];
  const log: string[] = [];

  // --- Pass 1: resolve each proposal individually ---
  for (const proposal of proposals) {
    const result = resolveProposal(proposal, state, constraints, promptConfig);

    if (result.rejected) {
      rejectedProposals.push({ proposal, reason: result.reason! });
      log.push(`REJECTED ${proposal.kind}: ${result.reason}`);
    } else {
      resolutions.push({
        proposal,
        deltas: result.deltas!,
        warnings: result.warnings ?? [],
        clamped: false,
      });
      log.push(`RESOLVED ${proposal.kind}: ${result.deltas!.length} delta(s)`);
    }
  }

  // --- Pass 2: aggregate and clamp ---
  const aggregatedDeltas = aggregateProposalDeltas(
    resolutions,
    state,
    constraints,
    appliedConstraints,
    log
  );

  // --- Pass 3: mark clamped resolutions ---
  const clampedKeys = new Set(
    aggregatedDeltas.filter((d) => d.clampedFrom !== undefined).map((d) => `${d.field}|${d.actorId ?? ''}`)
  );
  for (const resolution of resolutions) {
    if (
      resolution.deltas.some((d) =>
        clampedKeys.has(`${d.field}|${d.actorId ?? ''}`)
      )
    ) {
      resolution.clamped = true;
    }
  }

  return { resolutions, aggregatedDeltas, rejectedProposals, appliedConstraints, log };
}

interface ProposalResolveResult {
  rejected?: boolean;
  reason?: string;
  deltas?: ResourceDelta[];
  warnings?: string[];
}

function resolveProposal(
  proposal: ProposedStateChange,
  state: ScenarioState,
  constraints: ResolverConstraints,
  promptConfig?: ScenarioPromptConfig | null
): ProposalResolveResult {
  switch (proposal.kind) {
    case 'actor_resource_delta': {
      const lookup = lookupActorResource(proposal.actorId, proposal.resourceId, state);
      if (!lookup) {
        return { rejected: true, reason: `Actor/resource not found: ${proposal.actorId}/${proposal.resourceId}` };
      }

      const delta = getIntensityDelta(proposal.kind, proposal.resourceId, proposal.intensity, promptConfig);
      const bounds = constraints.fieldBounds[lookup.fieldName];
      const provisionalFinal = bounds
        ? Math.max(bounds.min, Math.min(bounds.max, lookup.currentValue + delta))
        : lookup.currentValue + delta;

      return {
        deltas: [{
          category: classifyField(lookup.fieldName),
          field: lookup.fieldName,
          actorId: lookup.actorId,
          delta,
          finalValue: provisionalFinal,
          reason: `actor_resource_delta (${proposal.intensity})`,
        }],
      };
    }

    case 'world_numeric_delta': {
      const lookup = lookupWorldVariable(proposal.variableId, state);
      if (!lookup) {
        return { rejected: true, reason: `World variable not found: ${proposal.variableId}` };
      }

      const delta = getIntensityDelta(proposal.kind, proposal.variableId, proposal.intensity, promptConfig);
      const bounds = constraints.fieldBounds[lookup.fieldName];
      const provisionalFinal = bounds
        ? Math.max(bounds.min, Math.min(bounds.max, lookup.currentValue + delta))
        : lookup.currentValue + delta;

      return {
        deltas: [{
          category: classifyField(lookup.fieldName),
          field: lookup.fieldName,
          delta,
          finalValue: provisionalFinal,
          reason: `world_numeric_delta (${proposal.intensity})`,
        }],
      };
    }

    case 'world_fact_set': {
      // Fact sets don't produce numeric deltas - they're handled separately
      // Return empty deltas but mark as resolved
      return {
        deltas: [],
        warnings: ['world_fact_set proposals are applied directly, not via resolver deltas'],
      };
    }

    case 'relationship_strength_delta': {
      const lookup = lookupRelationship(proposal.relationshipId, state);
      if (!lookup) {
        return { rejected: true, reason: `Relationship not found: ${proposal.relationshipId}` };
      }

      const delta = getIntensityDelta(proposal.kind, proposal.relationshipId, proposal.intensity, promptConfig);
      // Relationship strength is 0-100
      const provisionalFinal = Math.max(0, Math.min(100, lookup.currentValue + delta));

      return {
        deltas: [{
          category: 'positional',
          field: `relationship:${proposal.relationshipId}`,
          delta,
          finalValue: provisionalFinal,
          reason: `relationship_strength_delta (${proposal.intensity})`,
        }],
      };
    }

    case 'relationship_type_set': {
      // Type sets don't produce numeric deltas - they're handled separately
      return {
        deltas: [],
        warnings: ['relationship_type_set proposals are applied directly, not via resolver deltas'],
      };
    }

    default: {
      const _exhaustive: never = proposal;
      return { rejected: true, reason: `Unknown proposal kind: ${(_exhaustive as ProposedStateChange).kind}` };
    }
  }
}

// ---------------------------------------------------------------------------
// Shared aggregation logic
// ---------------------------------------------------------------------------

type AggEntry = {
  field: string;
  actorId?: string;
  category: ResourceCategory;
  totalDelta: number;
  reasons: string[];
};

function aggregateAndClamp(
  resolutions: EffectResolution[],
  state: ScenarioState,
  constraints: ResolverConstraints,
  appliedConstraints: string[],
  log: string[]
): ResourceDelta[] {
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

  return clampDeltas(deltaMap, state, constraints, appliedConstraints, log);
}

function aggregateProposalDeltas(
  resolutions: ProposalResolution[],
  state: ScenarioState,
  constraints: ResolverConstraints,
  appliedConstraints: string[],
  log: string[]
): ResourceDelta[] {
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

  return clampDeltas(deltaMap, state, constraints, appliedConstraints, log);
}

function clampDeltas(
  deltaMap: Map<string, AggEntry>,
  state: ScenarioState,
  constraints: ResolverConstraints,
  appliedConstraints: string[],
  log: string[]
): ResourceDelta[] {
  const aggregatedDeltas: ResourceDelta[] = [];

  for (const [, agg] of deltaMap) {
    const cap = constraints.maxDeltaPerTurn[agg.field];
    let cappedDelta = agg.totalDelta;
    let clampedFrom: number | undefined;

    if (cap !== undefined && Math.abs(cappedDelta) > cap) {
      clampedFrom = cappedDelta;
      cappedDelta = Math.sign(cappedDelta) * cap;
      const msg = `"${agg.field}" per-turn delta clamped from ${clampedFrom} to ${cappedDelta} (cap: ${cap})`;
      appliedConstraints.push(msg);
      log.push(`CAPPED: ${msg}`);
    }

    // Resolve current value for final computation
    let currentValue = 0;
    if (agg.actorId !== undefined) {
      const actor = state.actors.find((a) => a.id === agg.actorId);
      const resource = actor?.resources.find((r) => r.name === agg.field);
      if (resource !== undefined) currentValue = resource.value;
    } else if (!agg.field.startsWith('relationship:')) {
      const worldVar = state.worldVariables.find(
        (v) => v.name === agg.field && NUMERIC_KINDS.has(v.kind)
      );
      if (worldVar !== undefined) {
        const parsed = parseFloat(worldVar.value);
        if (!isNaN(parsed)) currentValue = parsed;
      }
    } else {
      // Relationship field
      const relId = agg.field.replace('relationship:', '');
      const rel = state.relationships.find((r) => r.id === relId);
      if (rel) currentValue = rel.strength;
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
      } else if (rawFinal > bounds.max) {
        const msg = `"${agg.field}" final value ${rawFinal} clamped to max ${bounds.max}`;
        appliedConstraints.push(msg);
        log.push(`BOUNDS: ${msg}`);
        finalValue = bounds.max;
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

  return aggregatedDeltas;
}
