import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildSuggestedChoice,
  validateGeneratedChoices,
} from "../../choices/validation";
import type { ScenarioPackage } from "@/lib/scenario-dsl";
import type { Choice, ScenarioState } from "@/lib/types";

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
    metadata: { title: "Test" },
    stateExtensions: {
      objectTypes: [],
      objects: [],
    },
    effectDefinitions: [
      {
        id: "fortify_location",
        label: "Fortify Location",
        description: "Fortify a location.",
        intensities: {},
      },
    ],
    choicePolicy: {
      minChoices: 3,
      maxChoices: 5,
    },
  };
}

describe("choice validation", () => {
  it("filters out duplicates, repeats, and ungrounded choices", () => {
    const state = makeState();
    const scenarioPackage = makePackage();
    const choices: Choice[] = [
      {
        id: "1",
        text: "Fortify Western Pass",
        description: "Strengthen defenses at Western Pass.",
      },
      {
        id: "2",
        text: "Fortify Western Pass",
        description: "Duplicate choice.",
      },
      {
        id: "3",
        text: "Do Something Random",
        description: "Vague and ungrounded.",
      },
    ];

    const result = validateGeneratedChoices(state, choices, {
      previousChoices: [
        {
          id: "old",
          text: "Negotiate with Archon Lyra",
          description: "old",
        },
      ],
      scenarioPackage,
    });

    assert.equal(result.length, 1);
    assert.equal(result[0]?.text, "Fortify Western Pass");
  });

  it("builds a suggested choice candidate when input is reasonable", () => {
    const choice = buildSuggestedChoice(
      "Fortify the western pass before winter",
      makeState()
    );

    assert.ok(choice);
    assert.match(choice?.id ?? "", /^suggested_/);
    assert.equal(choice?.text, "Fortify the western pass before winter");
    assert.equal(choice?.source, "suggested");
  });

  it("rejects choices with invalid scenario effect execution metadata", () => {
    const state = makeState();
    const scenarioPackage = makePackage();

    const choices: Choice[] = [
      {
        id: "bad",
        text: "Fortify Western Pass",
        description: "Strengthen defenses at Western Pass.",
        execution: {
          kind: "scenario_effect",
          invocation: {
            effectId: "fortify_location",
            intensity: "moderate",
            bindings: {
              actor: "actor_player",
              location: "actor_lyra",
            },
          },
        },
      },
    ];

    const result = validateGeneratedChoices(state, choices, {
      scenarioPackage,
    });

    assert.equal(result.length, 0);
  });
});
