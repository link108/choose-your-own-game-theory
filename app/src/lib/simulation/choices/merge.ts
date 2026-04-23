import type { Choice } from "@/lib/types";

export function prependSuggestedChoice(
  currentChoices: Choice[],
  suggestedChoice: Choice,
  maxChoices: number
): Choice[] {
  const normalizedSuggested = normalize(suggestedChoice.text);
  const dedupedCurrent = currentChoices.filter(
    (choice) => normalize(choice.text) !== normalizedSuggested
  );

  return [suggestedChoice, ...dedupedCurrent].slice(0, Math.max(1, maxChoices));
}

function normalize(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}
