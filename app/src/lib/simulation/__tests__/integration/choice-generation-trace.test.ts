import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { ChoiceGenerationError, getLLMChoices } from "@/lib/llm/game-llm";
import { buildChoiceGenerationPrompt } from "@/lib/llm/prompts/choices";
import { setLLMProviderForTesting } from "@/lib/llm/provider";
import type { LLMProvider } from "@/lib/llm/types";
import type { Choice, ScenarioState } from "@/lib/types";
import type { ScenarioPackage } from "@/lib/scenario-dsl";

function makeState(): ScenarioState {
  return {
    scenarioId: "scenario-test",
    sessionId: "session-test",
    turn: 2,
    actors: [
      {
        id: "actor_player",
        name: "Duke Aldric",
        description: "Player",
        goals: [],
        traits: [],
        isPlayer: true,
        resources: [
          {
            id: "resource_gold",
            name: "Gold",
            value: 100,
            minValue: 0,
            maxValue: 1000,
          },
        ],
      },
      {
        id: "actor_lyra",
        name: "Archon Lyra",
        description: "NPC",
        goals: [],
        traits: [],
        isPlayer: false,
        resources: [],
      },
    ],
    relationships: [],
    worldVariables: [
      {
        id: "world_season",
        name: "Season",
        value: "Autumn",
        kind: "text",
        minValue: null,
        maxValue: null,
      },
    ],
    scenarioObjectTypes: [
      {
        id: "location",
        label: "Location",
        fields: {},
      },
    ],
    scenarioObjects: [
      {
        id: "object_western_pass",
        typeId: "location",
        name: "Western Pass",
        visibility: "visible",
        fields: {},
      },
    ],
    eventHistory: [],
  };
}

function makePackage(): ScenarioPackage {
  return {
    version: 1,
    metadata: { title: "Trace Test" },
    stateExtensions: {
      objectTypes: [],
      objects: [],
    },
    effectDefinitions: [
      {
        id: "fortify_location",
        label: "Fortify Location",
        description: "Fortify a location.",
        parameters: {
          actor: { type: "actor", required: true },
          location: { type: "object", objectType: "location", required: true },
        },
        intensities: {
          minor: [
            {
              op: "addEvent",
              eventType: "fortify_location",
              description: "$actor fortifies $location",
            },
          ],
        },
      },
    ],
    choicePolicy: {
      minChoices: 3,
      maxChoices: 5,
    },
  };
}

afterEach(() => {
  setLLMProviderForTesting(null);
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.LLM_PROVIDER;
});

describe("choice generation trace", () => {
  it("includes canonical ids in the prompt guidance for structured bindings", () => {
    const messages = buildChoiceGenerationPrompt(
      makeState(),
      { text: "Inspect the battlements" },
      {
        scenarioPackage: makePackage(),
      }
    );

    assert.match(messages[0]?.content ?? "", /ALWAYS use canonical ids/i);
    assert.match(messages[0]?.content ?? "", /valid_intensity_for_effect/);
    assert.match(messages[1]?.content ?? "", /Duke Aldric \(id: actor_player\)/);
    assert.match(
      messages[1]?.content ?? "",
      /Western Pass \(id: object_western_pass, type: location\)/
    );
    assert.match(messages[1]?.content ?? "", /valid intensities: minor/);
  });

  it("omits empty intensities from prompt guidance", () => {
    const scenarioPackage: ScenarioPackage = {
      ...makePackage(),
      effectDefinitions: [
        {
          ...makePackage().effectDefinitions[0],
          intensities: {
            minor: [
              {
                op: "addEvent",
                eventType: "fortify_location",
                description: "$actor fortifies $location",
              },
            ],
            moderate: [],
            major: [],
          },
        },
      ],
    };

    const messages = buildChoiceGenerationPrompt(
      makeState(),
      { text: "Inspect the battlements" },
      {
        scenarioPackage,
      }
    );

    assert.match(messages[1]?.content ?? "", /valid intensities: minor/);
    assert.doesNotMatch(messages[1]?.content ?? "", /valid intensities: .*moderate/);
    assert.doesNotMatch(messages[1]?.content ?? "", /valid intensities: .*major/);
  });

  it("treats suggested actions as guidance instead of a returned choice", () => {
    const messages = buildChoiceGenerationPrompt(
      makeState(),
      undefined,
      {
        scenarioPackage: makePackage(),
        suggestedAction: "Attempt to make a peace treaty with Korath",
      }
    );

    assert.match(messages[1]?.content ?? "", /directional guidance/i);
    assert.match(messages[1]?.content ?? "", /Do not restate it verbatim/i);
  });

  it("captures prompts, responses, and rejection reasons on generation failure", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.LLM_PROVIDER = "openrouter";

    let calls = 0;
    const provider: LLMProvider = {
      async complete() {
        calls += 1;
        return JSON.stringify({
          choices: [
            {
              id: "repeat_choice",
              text: "Fortify Western Pass",
              description: "Strengthen the pass before winter.",
            },
          ],
        });
      },
    };

    setLLMProviderForTesting(provider);

    const previousChoices: Choice[] = [
      {
        id: "old_choice",
        text: "Fortify Western Pass",
        description: "Already offered.",
      },
    ];

    await assert.rejects(
      () =>
        getLLMChoices(
          makeState(),
          { text: "Inspect the battlements" },
          {
            previousChoices,
            scenarioPackage: makePackage(),
          }
        ),
      (error: unknown) => {
        assert.ok(error instanceof ChoiceGenerationError);
        assert.equal(calls, 2);
        assert.equal(error.trace.attempts.length, 2);
        assert.equal(error.trace.previousChoiceCount, 1);
        assert.equal(error.trace.excludedChoiceCount, 0);
        assert.equal(error.trace.attempts[0]?.prompt[0]?.role, "system");
        assert.match(
          error.trace.attempts[0]?.rawResponse ?? "",
          /Fortify Western Pass/
        );
        assert.match(
          error.trace.attempts[1]?.prompt[1]?.content ?? "",
          /Retry guidance from the previous failed attempt/i
        );
        assert.deepEqual(error.trace.attempts[0]?.rejectedChoices, [
          {
            id: "repeat_choice",
            text: "Fortify Western Pass",
            reasons: ["repeated_previous_choice"],
          },
        ]);
        assert.match(error.message, /expected at least 3/);
        return true;
      }
    );
  });

  it("surfaces concrete execution errors when the model binds names instead of ids", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.LLM_PROVIDER = "openrouter";

    const provider: LLMProvider = {
      async complete() {
        return JSON.stringify({
          choices: [
            {
              id: "fortify_western_pass",
              text: "Fortify Western Pass",
              description: "Reinforce the pass immediately.",
              execution: {
                kind: "scenario_effect",
                invocation: {
                  effectId: "fortify_location",
                  intensity: "minor",
                  bindings: {
                    actor: "Duke Aldric",
                    location: "Western Pass",
                  },
                },
              },
            },
          ],
        });
      },
    };

    setLLMProviderForTesting(provider);

    await assert.rejects(
      () =>
        getLLMChoices(makeState(), undefined, {
          scenarioPackage: makePackage(),
        }),
      (error: unknown) => {
        assert.ok(error instanceof ChoiceGenerationError);
        assert.deepEqual(error.trace.attempts[0]?.rejectedChoices, [
          {
            id: "fortify_western_pass",
            text: "Fortify Western Pass",
            reasons: ["invalid_execution"],
            executionError: "Actor binding not found: Duke Aldric",
          },
        ]);
        return true;
      }
    );
  });

  it("keeps shown page choices separate from taken choice history in traces", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.LLM_PROVIDER = "openrouter";

    let calls = 0;
    const provider: LLMProvider = {
      async complete() {
        calls += 1;
        return JSON.stringify({
          choices: [
            {
              id: "repeat_shown_choice",
              text: "Fortify Western Pass",
              description: "Offer the same choice again.",
            },
          ],
        });
      },
    };

    setLLMProviderForTesting(provider);

    await assert.rejects(
      () =>
        getLLMChoices(makeState(), undefined, {
          previousChoices: [],
          excludedChoices: [
            {
              id: "shown_choice",
              text: "Fortify Western Pass",
              description: "Shown on the current page.",
            },
          ],
          scenarioPackage: makePackage(),
        }),
      (error: unknown) => {
        assert.ok(error instanceof ChoiceGenerationError);
        assert.equal(calls, 2);
        assert.equal(error.trace.previousChoiceCount, 0);
        assert.equal(error.trace.excludedChoiceCount, 1);
        assert.match(
          error.trace.attempts[0]?.prompt[1]?.content ?? "",
          /avoid returning these exact labels/i
        );
        assert.deepEqual(error.trace.attempts[0]?.rejectedChoices, [
          {
            id: "repeat_shown_choice",
            text: "Fortify Western Pass",
            reasons: ["repeated_excluded_choice"],
          },
        ]);
        return true;
      }
    );
  });
});
