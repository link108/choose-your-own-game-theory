import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { setLLMProviderForTesting } from "@/lib/llm/provider";
import type { LLMProvider } from "@/lib/llm/types";
import { generateScenarioCreationConversationTurn } from "@/lib/scenario-creation";

afterEach(() => {
  setLLMProviderForTesting(null);
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.LLM_PROVIDER;
});

describe("scenario creation conversation", () => {
  it("falls back to a deterministic option group when no LLM is configured", async () => {
    const result = await generateScenarioCreationConversationTurn({
      workingDraft: null,
      messages: [
        {
          role: "user",
          content: "I want to model a diplomatic crisis in the Strait of Hormuz.",
        },
      ],
    });

    assert.match(result.assistantMessage, /playable scenario/i);
    assert.equal(result.workingDraft.premise, "I want to model a diplomatic crisis in the Strait of Hormuz.");
    assert.equal(result.optionGroup?.kind, "scenario_mode");
    assert.equal(result.optionGroup?.options.length, 3);
  });

  it("uses the configured LLM provider when available", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.LLM_PROVIDER = "openrouter";

    const provider: LLMProvider = {
      async complete() {
        return JSON.stringify({
          message: "A realistic diplomacy frame fits this premise well.",
          optionGroup: {
            stage: "frame_mode",
            kind: "scenario_mode",
            title: "Recommended Mode",
            selectionMode: "single",
            options: [
              {
                id: "realistic_diplomacy",
                label: "Realistic diplomacy",
                payload: {
                  mode: "realistic diplomacy",
                  realismLevel: "high",
                },
              },
            ],
          },
          workingDraftPatch: {
            premise: "Hormuz diplomatic crisis",
            mode: "realistic diplomacy",
            realismLevel: "high",
          },
        });
      },
    };

    setLLMProviderForTesting(provider);

    const result = await generateScenarioCreationConversationTurn({
      workingDraft: null,
      messages: [
        {
          role: "user",
          content: "I want to model a diplomatic crisis in the Strait of Hormuz.",
        },
      ],
    });

    assert.equal(
      result.assistantMessage,
      "A realistic diplomacy frame fits this premise well."
    );
    assert.equal(result.workingDraft.mode, "realistic diplomacy");
    assert.equal(result.optionGroup?.title, "Recommended Mode");
  });
});
