import type { ScenarioState, StateChange } from "@/lib/types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  clampedChanges: StateChange[]; // changes with values clamped to bounds
}

/**
 * Validate and sanitize proposed state changes against the current state.
 * Returns clamped changes (within bounds) and any errors/warnings.
 */
export function validateStateChanges(
  state: ScenarioState,
  proposedChanges: StateChange[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const clampedChanges: StateChange[] = [];

  for (const change of proposedChanges) {
    switch (change.type) {
      case "resource": {
        const result = validateResourceChange(state, change);
        if (result.error) errors.push(result.error);
        if (result.warning) warnings.push(result.warning);
        if (result.change) clampedChanges.push(result.change);
        break;
      }
      case "relationship": {
        const result = validateRelationshipChange(state, change);
        if (result.error) errors.push(result.error);
        if (result.change) clampedChanges.push(result.change);
        break;
      }
      case "worldVariable": {
        const result = validateWorldVariableChange(state, change);
        if (result.error) errors.push(result.error);
        if (result.warning) warnings.push(result.warning);
        if (result.change) clampedChanges.push(result.change);
        break;
      }
      default:
        // Pass through unknown types
        clampedChanges.push(change);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    clampedChanges,
  };
}

function validateResourceChange(
  state: ScenarioState,
  change: StateChange
): { error?: string; warning?: string; change?: StateChange } {
  const actor = state.actors.find((a) => a.name === change.target);
  if (!actor) {
    return {
      error: `Actor "${change.target}" not found — cannot change resource`,
    };
  }

  const resource = actor.resources.find((r) => r.name === change.field);
  if (!resource) {
    return {
      error: `Resource "${change.field}" not found on actor "${change.target}"`,
    };
  }

  let newValue =
    typeof change.newValue === "number"
      ? change.newValue
      : parseInt(String(change.newValue));

  if (isNaN(newValue)) {
    return {
      error: `Invalid resource value "${change.newValue}" for ${change.target}.${change.field}`,
    };
  }

  let warning: string | undefined;

  // Clamp to bounds
  if (newValue < resource.minValue) {
    warning = `${change.target}'s ${change.field} clamped from ${newValue} to ${resource.minValue} (minimum)`;
    newValue = resource.minValue;
  }
  if (newValue > resource.maxValue) {
    warning = `${change.target}'s ${change.field} clamped from ${newValue} to ${resource.maxValue} (maximum)`;
    newValue = resource.maxValue;
  }

  return {
    warning,
    change: { ...change, newValue, oldValue: resource.value },
  };
}

function validateRelationshipChange(
  state: ScenarioState,
  change: StateChange
): { error?: string; change?: StateChange } {
  // Verify actors exist
  const actor = state.actors.find(
    (a) => a.name === change.target || a.id === change.target
  );
  if (!actor) {
    return {
      error: `Actor "${change.target}" not found — cannot change relationship`,
    };
  }

  if (change.field === "strength") {
    let newValue =
      typeof change.newValue === "number"
        ? change.newValue
        : parseInt(String(change.newValue));

    if (isNaN(newValue)) {
      return { error: `Invalid relationship strength "${change.newValue}"` };
    }

    // Clamp strength to 0-100
    newValue = Math.max(0, Math.min(100, newValue));

    return { change: { ...change, newValue } };
  }

  if (change.field === "type") {
    const validTypes = [
      "ally",
      "rival",
      "neutral",
      "vassal",
      "overlord",
      "trade_partner",
    ];
    if (!validTypes.includes(String(change.newValue))) {
      return {
        error: `Invalid relationship type "${change.newValue}". Must be one of: ${validTypes.join(", ")}`,
      };
    }
    return { change };
  }

  return { change };
}

function validateWorldVariableChange(
  state: ScenarioState,
  change: StateChange
): { error?: string; warning?: string; change?: StateChange } {
  const variable = state.worldVariables.find(
    (v) => v.name === change.target
  );
  if (!variable) {
    return {
      error: `World variable "${change.target}" not found`,
    };
  }

  let newValue = change.newValue;

  // Kind consistency check
  if (variable.kind === "resource" || variable.kind === "countdown" || variable.kind === "counter") {
    const numValue =
      typeof newValue === "number" ? newValue : parseFloat(String(newValue));
    if (isNaN(numValue)) {
      return {
        error: `World variable "${change.target}" expects a number, got "${newValue}"`,
      };
    }

    // Clamp to min/max if defined
    let warning: string | undefined;
    let clamped = numValue;
    if (variable.minValue !== null) {
      const min = parseFloat(variable.minValue);
      if (!isNaN(min) && clamped < min) {
        warning = `${change.target} clamped from ${clamped} to ${min} (minimum)`;
        clamped = min;
      }
    }
    if (variable.maxValue !== null) {
      const max = parseFloat(variable.maxValue);
      if (!isNaN(max) && clamped > max) {
        warning = `${change.target} clamped from ${clamped} to ${max} (maximum)`;
        clamped = max;
      }
    }

    newValue = String(clamped);
    return {
      warning,
      change: { ...change, newValue, oldValue: variable.value },
    };
  }

  if (variable.kind === "flag") {
    const strVal = String(newValue).toLowerCase();
    if (strVal !== "true" && strVal !== "false") {
      return {
        error: `World variable "${change.target}" expects boolean, got "${newValue}"`,
      };
    }
    newValue = strVal;
  }

  return {
    change: { ...change, newValue: String(newValue), oldValue: variable.value },
  };
}

/**
 * Validate that a choice ID exists in the available choices.
 */
export function validateChoice(
  choiceId: string,
  availableChoices: { id: string }[]
): boolean {
  return availableChoices.some((c) => c.id === choiceId);
}

/**
 * Validate that all actor references in state changes exist.
 */
export function validateEntityReferences(
  state: ScenarioState,
  changes: StateChange[]
): string[] {
  const errors: string[] = [];
  const actorNames = new Set(state.actors.map((a) => a.name));
  const actorIds = new Set(state.actors.map((a) => a.id));
  const varNames = new Set(state.worldVariables.map((v) => v.name));

  for (const change of changes) {
    if (change.type === "resource" || change.type === "relationship") {
      if (!actorNames.has(change.target) && !actorIds.has(change.target)) {
        errors.push(
          `Referenced actor "${change.target}" does not exist`
        );
      }
    }
    if (change.type === "worldVariable") {
      if (!varNames.has(change.target)) {
        errors.push(
          `Referenced world variable "${change.target}" does not exist`
        );
      }
    }
  }

  return errors;
}
