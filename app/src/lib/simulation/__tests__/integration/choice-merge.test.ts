import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prependSuggestedChoice } from "../../choices/merge";
import type { Choice } from "@/lib/types";

describe("choice merge", () => {
  it("prepends a suggested choice ahead of existing choices", () => {
    const currentChoices: Choice[] = [
      { id: "1", text: "Fortify Western Pass", description: "Existing 1" },
      { id: "2", text: "Request loan from Lyra", description: "Existing 2" },
    ];

    const merged = prependSuggestedChoice(
      currentChoices,
      {
        id: "new",
        text: "Send envoys to Korath",
        description: "Suggested",
      },
      5
    );

    assert.deepEqual(
      merged.map((choice) => choice.text),
      ["Send envoys to Korath", "Fortify Western Pass", "Request loan from Lyra"]
    );
  });

  it("removes an existing duplicate before prepending the suggested choice", () => {
    const currentChoices: Choice[] = [
      { id: "1", text: "Fortify Western Pass", description: "Existing 1" },
      { id: "2", text: "Request loan from Lyra", description: "Existing 2" },
    ];

    const merged = prependSuggestedChoice(
      currentChoices,
      {
        id: "new",
        text: "Request loan from Lyra",
        description: "Suggested",
      },
      5
    );

    assert.deepEqual(
      merged.map((choice) => choice.text),
      ["Request loan from Lyra", "Fortify Western Pass"]
    );
  });

  it("caps the final list at the scenario max choice count", () => {
    const currentChoices: Choice[] = [
      { id: "1", text: "A", description: "A" },
      { id: "2", text: "B", description: "B" },
      { id: "3", text: "C", description: "C" },
      { id: "4", text: "D", description: "D" },
    ];

    const merged = prependSuggestedChoice(
      currentChoices,
      {
        id: "new",
        text: "New",
        description: "Suggested",
      },
      3
    );

    assert.deepEqual(
      merged.map((choice) => choice.text),
      ["New", "A", "B"]
    );
  });
});
