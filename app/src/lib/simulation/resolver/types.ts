export type EffectIntensity = 'minor' | 'moderate' | 'major';

export interface SemanticEffect {
  type: string;
  intensity: EffectIntensity;
  scope?: string;
  target?: string;
}

export type ResourceCategory = 'hard' | 'positional' | 'risk';

export interface ResourceDelta {
  category: ResourceCategory;
  field: string;
  actorId?: string;
  delta: number;
  finalValue: number;
  clampedFrom?: number;
  reason: string;
}

export interface EffectResolution {
  effect: SemanticEffect;
  deltas: ResourceDelta[];
  warnings: string[];
  clamped: boolean;
}

export interface RejectedEffect {
  effect: SemanticEffect;
  reason: string;
}

export interface ResolverResult {
  resolutions: EffectResolution[];
  aggregatedDeltas: ResourceDelta[];
  rejectedEffects: RejectedEffect[];
  appliedConstraints: string[];
  log: string[];
}

/** effectType → intensity → fieldName → numeric delta */
export type ResolverRuleset = Record<string, Record<string, Record<string, number>>>;

export interface ResolverConstraints {
  maxDeltaPerTurn: Record<string, number>;
  fieldBounds: Record<string, { min: number; max: number }>;
  maxEffectsPerTurn: number;
  allowUnknownEffects: boolean;
}
