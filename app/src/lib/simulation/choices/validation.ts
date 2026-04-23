import type { Choice, ScenarioState } from "@/lib/types";
import { expandScenarioEffect } from "@/lib/scenario-dsl";
import type { ScenarioPackage } from "@/lib/scenario-dsl";

export interface ChoiceValidationOptions {
  previousChoices?: Choice[];
  excludedChoices?: Choice[];
  scenarioPackage?: ScenarioPackage;
  suggestedAction?: string;
}

export interface ChoiceValidationInspection {
  choice: Choice;
  valid: boolean;
  reasons: Array<
    | "empty_text"
    | "too_short"
    | "duplicate_in_batch"
    | "repeated_previous_choice"
    | "repeated_excluded_choice"
    | "ungrounded_to_state"
    | "invalid_execution"
  >;
  executionError?: string;
}

export function validateGeneratedChoices(
  state: ScenarioState,
  choices: Choice[] | null | undefined,
  options: ChoiceValidationOptions = {}
): Choice[] {
  return inspectGeneratedChoices(state, choices, options)
    .filter((item) => item.valid)
    .map((item) => item.choice);
}

export function inspectGeneratedChoices(
  state: ScenarioState,
  choices: Choice[] | null | undefined,
  options: ChoiceValidationOptions = {}
): ChoiceValidationInspection[] {
  if (!choices || choices.length === 0) return [];

  const previousTexts = new Set(
    (options.previousChoices ?? []).map((choice) => normalize(choice.text))
  );
  const excludedTexts = new Set(
    (options.excludedChoices ?? []).map((choice) => normalize(choice.text))
  );
  const seenTexts = new Set<string>();
  const groundedTerms = buildGroundedTerms(state, options.scenarioPackage);

  return choices.map((choice) => {
    const reasons: ChoiceValidationInspection["reasons"] = [];
    const text = normalize(choice.text);
    const description = normalize(choice.description);
    if (!text) reasons.push("empty_text");
    if (text.length > 0 && text.length < 6) reasons.push("too_short");
    if (seenTexts.has(text)) reasons.push("duplicate_in_batch");
    if (previousTexts.has(text)) reasons.push("repeated_previous_choice");
    if (excludedTexts.has(text)) reasons.push("repeated_excluded_choice");

    const executionError = getChoiceExecutionError(
      state,
      choice,
      options.scenarioPackage
    );

    const combined = `${text} ${description}`.trim();
    const grounded =
      (choice.execution && !executionError) ||
      groundedTerms.length === 0 ||
      groundedTerms.some((term) => combined.includes(term));

    if (!grounded) reasons.push("ungrounded_to_state");
    if (executionError) {
      reasons.push("invalid_execution");
    }

    if (reasons.length === 0) {
      seenTexts.add(text);
    }

    return {
      choice,
      valid: reasons.length === 0,
      reasons,
      ...(executionError ? { executionError } : {}),
    };
  });
}

export function getChoiceExecutionError(
  state: ScenarioState,
  choice: Choice,
  scenarioPackage?: ScenarioPackage
): string | undefined {
  if (!choice.execution) return undefined;
  if (choice.execution.kind !== "scenario_effect") {
    return "Choice execution kind is not supported";
  }
  if (!scenarioPackage) {
    return "Scenario package is required for structured choice execution";
  }

  const expansion = expandScenarioEffect(
    state,
    scenarioPackage,
    choice.execution.invocation
  );

  return expansion.rejected;
}

function buildGroundedTerms(
  state: ScenarioState,
  scenarioPackage?: ScenarioPackage
): string[] {
  const terms = [
    ...state.actors.flatMap((actor) => expandGroundedTerms(actor.name)),
    ...state.worldVariables.flatMap((variable) =>
      expandGroundedTerms(variable.name)
    ),
    ...(state.scenarioObjects ?? []).flatMap((object) =>
      expandGroundedTerms(object.name)
    ),
    ...(scenarioPackage?.effectDefinitions ?? []).flatMap((effect) => [
      ...expandGroundedTerms(effect.label),
      ...expandGroundedTerms(effect.id),
    ]),
  ].filter(Boolean);

  return [...new Set(terms)];
}

function expandGroundedTerms(value: string | undefined | null): string[] {
  const normalized = normalize(value);
  if (!normalized) return [];

  const parts = normalized
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 4);

  return [normalized, ...parts];
}

function normalize(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}
