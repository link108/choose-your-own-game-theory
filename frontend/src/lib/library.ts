import type { Scenario } from "../api";

export type CategoryPresentation = {
  key: string;
  label: string;
  icon: CategoryIconName;
  accent: string;
};

export type CategoryIconName =
  | "briefcase"
  | "castle"
  | "compass"
  | "globe"
  | "grid"
  | "keyhole"
  | "network"
  | "orbit"
  | "spark";

export const UNCATEGORIZED = "Uncategorized";
export const FEATURED_SCENARIO_ID = "";

const categoryPresentation: Record<string, Omit<CategoryPresentation, "key" | "label">> = {
  "diplomacy-crisis": { icon: "globe", accent: "var(--category-diplomacy)" },
  "engineering-leadership": { icon: "network", accent: "var(--category-engineering)" },
  "everyday-dilemmas": { icon: "briefcase", accent: "var(--category-everyday)" },
  "fantasy-intrigue": { icon: "castle", accent: "var(--category-fantasy)" },
  "game-theory-classics": { icon: "grid", accent: "var(--category-classics)" },
  "health-conversations": { icon: "spark", accent: "var(--category-health)" },
  "living-world-events": { icon: "compass", accent: "var(--category-living)" },
  "mystery-heists": { icon: "keyhole", accent: "var(--category-mystery)" },
  "negotiation-deals": { icon: "spark", accent: "var(--category-negotiation)" },
  "sci-fi-frontier": { icon: "orbit", accent: "var(--category-scifi)" },
  "startup-survival": { icon: "network", accent: "var(--category-startup)" },
};

export function categoryLabel(category: string | null | undefined) {
  return category?.trim() || UNCATEGORIZED;
}

export function categoryKey(category: string | null | undefined) {
  return categoryLabel(category)
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getCategoryPresentation(category: string | null | undefined): CategoryPresentation {
  const label = categoryLabel(category);
  const key = categoryKey(label);
  return {
    key,
    label,
    ...(categoryPresentation[key] ?? { icon: "compass", accent: "var(--category-fallback)" }),
  };
}

export function groupScenarios(scenarios: Scenario[]) {
  const groups = new Map<string, Scenario[]>();
  for (const scenario of scenarios) {
    const key = categoryLabel(scenario.category);
    groups.set(key, [...(groups.get(key) ?? []), scenario]);
  }
  return groups;
}

export function filterScenarios(
  scenarios: Scenario[],
  options: { category: string | null; query: string },
) {
  const query = options.query.trim().toLowerCase();
  return scenarios.filter((scenario) => {
    if (options.category && categoryLabel(scenario.category) !== options.category) return false;
    if (!query) return true;

    const haystack = [
      scenario.title,
      scenario.premise,
      categoryLabel(scenario.category),
      scenario.tone,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

export function selectFeaturedScenario(scenarios: Scenario[]) {
  if (scenarios.length === 0) return null;
  if (FEATURED_SCENARIO_ID) {
    const configured = scenarios.find((scenario) => scenario.id === FEATURED_SCENARIO_ID);
    if (configured) return configured;
  }
  return scenarios.find((scenario) => scenario.is_living) ?? scenarios[0];
}

export function recentlyAdded(scenarios: Scenario[], limit: number) {
  return [...scenarios]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limit);
}
