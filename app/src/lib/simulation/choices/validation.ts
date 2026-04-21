import type { Choice, ScenarioState } from "@/lib/types";
import { expandScenarioEffect } from "@/lib/scenario-dsl";
import type { ScenarioPackage } from "@/lib/scenario-dsl";

export interface ChoiceValidationOptions {
  previousChoices?: Choice[];
  scenarioPackage?: ScenarioPackage;
  suggestedAction?: string;
}

export function validateGeneratedChoices(
  state: ScenarioState,
  choices: Choice[] | null | undefined,
  options: ChoiceValidationOptions = {}
): Choice[] {
  if (!choices || choices.length === 0) return [];

  const previousTexts = new Set(
    (options.previousChoices ?? []).map((choice) => normalize(choice.text))
  );
  const seenTexts = new Set<string>();
  const groundedTerms = buildGroundedTerms(state, options.scenarioPackage);

  return choices.filter((choice) => {
    const text = normalize(choice.text);
    const description = normalize(choice.description);
    if (!text) return false;
    if (text.length < 6) return false;
    if (seenTexts.has(text)) return false;
    if (previousTexts.has(text)) return false;

    const combined = `${text} ${description}`.trim();
    const grounded =
      groundedTerms.length === 0 ||
      groundedTerms.some((term) => combined.includes(term));

    if (!grounded) return false;
    if (!isValidChoiceExecution(state, choice, options.scenarioPackage)) return false;

    seenTexts.add(text);
    return true;
  });
}

export function buildSuggestedChoice(
  suggestion: string,
  state: ScenarioState
): Choice | null {
  const trimmed = suggestion.trim().replace(/\s+/g, " ");
  if (trimmed.length < 6 || trimmed.length > 120) return null;

  const player = state.actors.find((actor) => actor.isPlayer);
  const text = trimmed.replace(/[.?!]+$/, "");

  return {
    id: `suggested_${slugify(text).slice(0, 64)}`,
    text,
    description: player
      ? `${player.name} pursues this proposed course of action.`
      : "Pursue this proposed course of action.",
    source: "suggested",
    debugReasoning: "Player-suggested action included after validation.",
    debugReasoningSource: "suggested",
  };
}

function isValidChoiceExecution(
  state: ScenarioState,
  choice: Choice,
  scenarioPackage?: ScenarioPackage
): boolean {
  if (!choice.execution) return true;
  if (choice.execution.kind !== "scenario_effect") return false;
  if (!scenarioPackage) return false;

  const expansion = expandScenarioEffect(
    state,
    scenarioPackage,
    choice.execution.invocation
  );

  return expansion.rejected === undefined;
}

function buildGroundedTerms(
  state: ScenarioState,
  scenarioPackage?: ScenarioPackage
): string[] {
  const terms = [
    ...state.actors.map((actor) => normalize(actor.name)),
    ...state.worldVariables.map((variable) => normalize(variable.name)),
    ...(state.scenarioObjects ?? []).map((object) => normalize(object.name)),
    ...(scenarioPackage?.effectDefinitions ?? []).flatMap((effect) => [
      normalize(effect.label),
      ...normalize(effect.label)
        .split(" ")
        .filter((term) => term.length > 3),
    ]),
  ].filter(Boolean);

  return [...new Set(terms)];
}

function normalize(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
