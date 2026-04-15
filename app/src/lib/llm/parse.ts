import type { z } from 'zod';
import type {
  ProposedStateChange,
  ActorIntentProposal,
  ChoiceEffectsProposal,
  ValidationError,
} from '../simulation/proposals';
import {
  validateWithSchema,
  validateProposalsLenient,
} from '../simulation/proposals';

/**
 * Parse JSON from LLM output, handling markdown code fences and other wrapping.
 */
export function parseJSON<T>(raw: string): T {
  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {
    // Continue to cleanup
  }

  // Strip markdown code fences
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Try parsing cleaned version
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue to more aggressive cleanup
  }

  // Try to extract JSON object or array from the text
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // Fall through
    }
  }

  for (const candidate of extractBalancedJsonCandidates(cleaned)) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next balanced candidate.
    }
  }

  throw new Error(`Failed to parse JSON from LLM output: ${raw.slice(0, 200)}`);
}

function extractBalancedJsonCandidates(raw: string): string[] {
  const candidates: string[] = [];
  const starts = [...raw]
    .map((char, index) => ({ char, index }))
    .filter(({ char }) => char === "{" || char === "[");

  for (const { char, index } of starts) {
    const closeChar = char === "{" ? "}" : "]";
    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = index; i < raw.length; i++) {
      const current = raw[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (current === "\\") {
          escaped = true;
        } else if (current === "\"") {
          inString = false;
        }
        continue;
      }

      if (current === "\"") {
        inString = true;
        continue;
      }

      if (current === "{" || current === "[") {
        stack.push(current);
        continue;
      }

      if (current === "}" || current === "]") {
        const open = stack.at(-1);
        const expectedClose = open === "{" ? "}" : "]";
        if (current !== expectedClose) break;
        stack.pop();

        if (stack.length === 0 && current === closeChar) {
          candidates.push(raw.slice(index, i + 1));
          break;
        }
      }
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Proposal-based validation (new system)
// ---------------------------------------------------------------------------

export interface ProposalParseResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
  warnings?: string[];
}

/**
 * Validate and extract proposals from a parsed LLM response using a generated schema.
 */
export function validateProposals(
  data: unknown,
  proposalSchema: z.ZodType<ProposedStateChange>
): ProposalParseResult<ProposedStateChange[]> {
  if (!data || typeof data !== 'object') {
    return { success: false, errors: [{ path: [], message: 'Expected object response' }] };
  }

  const obj = data as Record<string, unknown>;
  const rawProposals = Array.isArray(obj.proposals) ? obj.proposals : [];

  if (rawProposals.length === 0) {
    // No proposals is valid (actor might not propose any changes)
    return { success: true, data: [] };
  }

  const { valid, invalid } = validateProposalsLenient(proposalSchema, rawProposals);
  const warnings: string[] = [];

  if (invalid.length > 0) {
    for (const inv of invalid) {
      const errorMsgs = inv.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      warnings.push(`Proposal at index ${inv.index} invalid: ${errorMsgs}`);
    }
  }

  return {
    success: true,
    data: valid,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validate an ActorIntentProposal response using a generated schema.
 */
export function validateActorProposalResponse(
  data: unknown,
  proposalSchema: z.ZodType<ProposedStateChange>
): ProposalParseResult<ActorIntentProposal> {
  if (!data || typeof data !== 'object') {
    return { success: false, errors: [{ path: [], message: 'Expected object response' }] };
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.action !== 'string' || !obj.action) {
    return { success: false, errors: [{ path: ['action'], message: 'Missing or invalid action' }] };
  }

  if (typeof obj.reasoning !== 'string' || !obj.reasoning) {
    return { success: false, errors: [{ path: ['reasoning'], message: 'Missing or invalid reasoning' }] };
  }

  const proposalResult = validateProposals(data, proposalSchema);

  return {
    success: true,
    data: {
      action: obj.action,
      reasoning: obj.reasoning,
      proposals: proposalResult.data ?? [],
    },
    warnings: proposalResult.warnings,
  };
}

/**
 * Validate a ChoiceEffectsProposal response using a generated schema.
 */
export function validateChoiceProposalResponse(
  data: unknown,
  proposalSchema: z.ZodType<ProposedStateChange>
): ProposalParseResult<ChoiceEffectsProposal> {
  const proposalResult = validateProposals(data, proposalSchema);

  return {
    success: true,
    data: {
      proposals: proposalResult.data ?? [],
    },
    warnings: proposalResult.warnings,
  };
}

// ---------------------------------------------------------------------------
// Legacy SemanticEffect validation
// ---------------------------------------------------------------------------

const VALID_INTENSITIES = new Set(['minor', 'moderate', 'major']);

/**
 * Validate and extract SemanticEffect[] from a parsed LLM response.
 * Strips any numeric delta fields if present and logs a warning.
 */
export function validateSemanticEffects(
  data: unknown,
  validEffectTypes?: Set<string>
): Array<{ type: string; intensity: 'minor' | 'moderate' | 'major'; scope?: string; target?: string }> {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const raw = Array.isArray(obj.effects) ? obj.effects : Array.isArray(data) ? data : [];

  const valid: Array<{ type: string; intensity: 'minor' | 'moderate' | 'major'; scope?: string; target?: string }> = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const effect = item as Record<string, unknown>;

    if (typeof effect.type !== 'string' || !effect.type) continue;
    if (typeof effect.intensity !== 'string' || !VALID_INTENSITIES.has(effect.intensity)) continue;

    // Warn if the LLM smuggled in numeric deltas
    if ('delta' in effect || 'value' in effect || 'newValue' in effect) {
      console.warn(`[parse] LLM included numeric fields in effect "${effect.type}" — stripping them`);
    }

    const intensity = effect.intensity as 'minor' | 'moderate' | 'major';

    // Filter against known effect types if provided
    if (validEffectTypes && !validEffectTypes.has(effect.type)) {
      console.warn(`[parse] LLM produced unknown effect type "${effect.type}" — will be rejected by resolver`);
    }

    valid.push({
      type: effect.type,
      intensity,
      ...(typeof effect.scope === 'string' ? { scope: effect.scope } : {}),
      ...(typeof effect.target === 'string' ? { target: effect.target } : {}),
    });
  }

  return valid;
}

/**
 * Validate that a parsed actor effects response has required fields.
 * Used in the resolver pipeline (replaces validateActorResponse for effects path).
 */
export function validateActorEffectsResponse(
  data: unknown,
  validEffectTypes?: Set<string>
): {
  action: string;
  reasoning: string;
  effects: Array<{ type: string; intensity: 'minor' | 'moderate' | 'major'; scope?: string; target?: string }>;
} | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  if (typeof obj.action !== 'string') return null;
  if (typeof obj.reasoning !== 'string') return null;

  return {
    action: obj.action,
    reasoning: obj.reasoning,
    effects: validateSemanticEffects(data, validEffectTypes),
  };
}

/**
 * Validate that a parsed actor response has required fields.
 */
export function validateActorResponse(data: unknown): {
  action: string;
  reasoning: string;
  stateChanges: Array<{
    type: string;
    target: string;
    field: string;
    delta?: number;
    newValue?: string | number;
    reason: string;
  }>;
} | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  if (typeof obj.action !== "string") return null;
  if (typeof obj.reasoning !== "string") return null;

  const stateChanges = Array.isArray(obj.stateChanges) ? obj.stateChanges : [];

  return {
    action: obj.action,
    reasoning: obj.reasoning,
    stateChanges: stateChanges.filter(
      (c: unknown) =>
        c &&
        typeof c === "object" &&
        typeof (c as Record<string, unknown>).type === "string" &&
        typeof (c as Record<string, unknown>).target === "string"
    ),
  };
}

/**
 * Validate that parsed choices have required fields.
 */
export function validateChoices(
  data: unknown
): Array<{ id: string; text: string; description: string }> | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  const choices = Array.isArray(obj.choices) ? obj.choices : Array.isArray(data) ? data : null;
  if (!choices) return null;

  const valid = choices
    .filter(
      (c: unknown) =>
        c &&
        typeof c === "object" &&
        typeof (c as Record<string, unknown>).text === "string"
    )
    .map((c: unknown, i: number) => {
      const choice = c as Record<string, unknown>;
      return {
        id: typeof choice.id === "string" ? choice.id : `choice_${i + 1}`,
        text: choice.text as string,
        description:
          typeof choice.description === "string"
            ? choice.description
            : (choice.text as string),
      };
    });

  return valid.length > 0 ? valid.slice(0, 5) : null;
}
