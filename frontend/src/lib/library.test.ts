import assert from "node:assert/strict";
import test from "node:test";
import type { Scenario } from "../api.ts";
import {
  filterScenarios,
  getCategoryPresentation,
  groupScenarios,
  recentlyAdded,
  selectFeaturedScenario,
} from "./library.ts";

const baseScenario = (overrides: Partial<Scenario>): Scenario => ({
  id: "scenario-1",
  title: "The Ultimatum",
  category: "Game Theory Classics",
  premise: "Split a prize under pressure.",
  setting: "",
  tone: "Strategic",
  goal: "",
  gm_notes: "",
  roles: [{ name: "Proposer", description: "", private_info: "" }],
  npcs: [],
  is_library: true,
  is_living: false,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

test("search filters by title, premise, category, and tone", () => {
  const scenarios = [
    baseScenario({ id: "1", title: "The Water Treaty", category: "Diplomacy & Crisis" }),
    baseScenario({ id: "2", title: "Airlock Arithmetic", category: "Sci-Fi Frontier" }),
    baseScenario({ id: "3", title: "Court of Thorns", premise: "A masked court chooses a queen." }),
  ];

  assert.deepEqual(
    filterScenarios(scenarios, { category: null, query: "treaty" }).map((s) => s.id),
    ["1"],
  );
  assert.deepEqual(
    filterScenarios(scenarios, { category: null, query: "sci-fi" }).map((s) => s.id),
    ["2"],
  );
  assert.deepEqual(
    filterScenarios(scenarios, { category: null, query: "MASKED" }).map((s) => s.id),
    ["3"],
  );
});

test("search works with category filtering and clearing search", () => {
  const scenarios = [
    baseScenario({ id: "1", title: "The Water Treaty", category: "Diplomacy & Crisis" }),
    baseScenario({ id: "2", title: "The Ceasefire", category: "Diplomacy & Crisis" }),
    baseScenario({ id: "3", title: "Vendor Lock", category: "Negotiation & Deals" }),
  ];

  assert.deepEqual(
    filterScenarios(scenarios, { category: "Diplomacy & Crisis", query: "the" }).map((s) => s.id),
    ["1", "2"],
  );
  assert.deepEqual(
    filterScenarios(scenarios, { category: "Diplomacy & Crisis", query: "" }).map((s) => s.id),
    ["1", "2"],
  );
});

test("featured scenario prefers living scenario deterministically", () => {
  const scenarios = [
    baseScenario({ id: "1", is_living: false }),
    baseScenario({ id: "2", is_living: true }),
  ];

  assert.equal(selectFeaturedScenario(scenarios)?.id, "2");
  assert.equal(selectFeaturedScenario([]), null);
});

test("category presentation has known and fallback identities", () => {
  assert.equal(getCategoryPresentation("Diplomacy & Crisis").icon, "globe");
  assert.equal(getCategoryPresentation("Future Category").icon, "compass");
});

test("grouping and recently added remain deterministic", () => {
  const scenarios = [
    baseScenario({ id: "1", category: "", created_at: "2024-01-01T00:00:00Z" }),
    baseScenario({ id: "2", category: "Mystery & Heists", created_at: "2024-03-01T00:00:00Z" }),
    baseScenario({ id: "3", category: "Mystery & Heists", created_at: "2024-02-01T00:00:00Z" }),
  ];

  assert.equal(groupScenarios(scenarios).get("Uncategorized")?.length, 1);
  assert.deepEqual(
    recentlyAdded(scenarios, 2).map((s) => s.id),
    ["2", "3"],
  );
});
