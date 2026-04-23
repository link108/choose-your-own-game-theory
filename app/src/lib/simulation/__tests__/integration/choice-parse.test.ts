import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateChoices,
  validateScenarioEffectInvocations,
} from "@/lib/llm/parse";
import type { ScenarioPackage } from "@/lib/scenario-dsl";

function makeScenarioPackage(): ScenarioPackage {
  return {
    version: 1,
    metadata: {
      title: "Choice Parse Test",
    },
    stateExtensions: {
      objectTypes: [
        {
          id: "location",
          label: "Location",
          fields: {},
        },
      ],
      objects: [
        {
          id: "object_western_pass",
          typeId: "location",
          name: "Western Pass",
          visibility: "visible",
          fields: {},
        },
      ],
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
          moderate: [],
        },
      },
    ],
    choicePolicy: {
      minChoices: 3,
      maxChoices: 5,
    },
  };
}

function makeScenarioPackageWithExecutableIntensity(): ScenarioPackage {
  return {
    ...makeScenarioPackage(),
    effectDefinitions: [
      {
        ...makeScenarioPackage().effectDefinitions[0],
        intensities: {
          moderate: [
            {
              op: "addEvent",
              eventType: "fortify_location",
              description: "$actor fortifies $location",
            },
          ],
        },
      },
    ],
  };
}

describe("choice parsing", () => {
  it("preserves valid scenario effect execution metadata", () => {
    const parsed = validateChoices(
      {
        choices: [
          {
            id: "fortify_west",
            text: "Fortify Western Pass",
            description: "Strengthen the pass before winter.",
            debugReasoning:
              "The western pass is exposed and can be improved immediately.",
            execution: {
              kind: "scenario_effect",
              invocation: {
                effectId: "fortify_location",
                intensity: "moderate",
                bindings: {
                  actor: "actor_valdris_aldric",
                  location: "object_western_pass",
                },
              },
            },
          },
        ],
      },
      makeScenarioPackageWithExecutableIntensity()
    );

    assert.ok(parsed);
    assert.equal(parsed?.length, 1);
    assert.equal(
      parsed?.[0]?.debugReasoning,
      "The western pass is exposed and can be improved immediately."
    );
    assert.equal(parsed?.[0]?.debugReasoningSource, "llm");
    assert.equal(parsed?.[0]?.execution?.kind, "scenario_effect");
    assert.equal(
      parsed?.[0]?.execution?.invocation.effectId,
      "fortify_location"
    );
  });

  it("drops invalid execution metadata but keeps the textual choice", () => {
    const parsed = validateChoices(
      {
        choices: [
          {
            id: "fortify_west",
            text: "Fortify Western Pass",
            description: "Strengthen the pass before winter.",
            execution: {
              kind: "scenario_effect",
              invocation: {
                effectId: "unknown_effect",
                intensity: "moderate",
                bindings: {},
              },
            },
          },
        ],
      },
      makeScenarioPackage()
    );

    assert.ok(parsed);
    assert.equal(parsed?.length, 1);
    assert.equal(parsed?.[0]?.execution, undefined);
  });

  it("rejects invocations for intensities with no operations", () => {
    const result = validateScenarioEffectInvocations(
      {
        effects: [
          {
            effectId: "fortify_location",
            intensity: "moderate",
            bindings: {
              actor: "actor_valdris_aldric",
              location: "object_western_pass",
            },
          },
        ],
      },
      makeScenarioPackage()
    );

    assert.deepEqual(result.effects, []);
    assert.deepEqual(result.warnings, [
      'Effect "fortify_location" does not define usable intensity "moderate"',
    ]);
  });
});
