import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inspectGeneratedChoices,
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

  it("reports rejection reasons for invalid generated choices", () => {
    const state = makeState();
    const scenarioPackage = makePackage();

    const inspection = inspectGeneratedChoices(
      state,
      [
        {
          id: "repeat",
          text: "Fortify Western Pass",
          description: "Repeat an existing option.",
        },
        {
          id: "vague",
          text: "Do Something Random",
          description: "Vague and ungrounded.",
        },
      ],
      {
        previousChoices: [
          {
            id: "old",
            text: "Fortify Western Pass",
            description: "old",
          },
        ],
        scenarioPackage,
      }
    );

    assert.deepEqual(inspection[0]?.reasons, ["repeated_previous_choice"]);
    assert.deepEqual(inspection[1]?.reasons, ["ungrounded_to_state"]);
  });

  it("rejects choices that were already shown on the current page during regeneration", () => {
    const state = makeState();
    const scenarioPackage = makePackage();

    const inspection = inspectGeneratedChoices(
      state,
      [
        {
          id: "repeat_page_choice",
          text: "Fortify Western Pass",
          description: "Re-offer the same page choice.",
        },
      ],
      {
        excludedChoices: [
          {
            id: "shown",
            text: "Fortify Western Pass",
            description: "Already shown on the page.",
          },
        ],
        scenarioPackage,
      }
    );

    assert.deepEqual(inspection[0]?.reasons, ["repeated_excluded_choice"]);
  });

  it("treats partial actor and location references as grounded", () => {
    const state = makeState();
    const scenarioPackage = makePackage();

    const inspection = inspectGeneratedChoices(
      state,
      [
        {
          id: "negotiate_lyra",
          text: "Negotiate with Archon Lyra",
          description: "Work with Lyra to improve your position before winter.",
        },
      ],
      {
        scenarioPackage,
      }
    );

    assert.deepEqual(inspection[0]?.reasons, []);
  });

  it("treats valid structured execution as grounded to state", () => {
    const state = makeState();
    const scenarioPackage: ScenarioPackage = {
      ...makePackage(),
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

    const inspection = inspectGeneratedChoices(
      state,
      [
        {
          id: "fortify_pass",
          text: "Secure the border route",
          description: "Commit forces to protect the frontier.",
          execution: {
            kind: "scenario_effect",
            invocation: {
              effectId: "fortify_location",
              intensity: "moderate",
              bindings: {
                actor: "actor_player",
                location: "object_western_pass",
              },
            },
          },
        },
      ],
      {
        scenarioPackage,
      }
    );

    assert.deepEqual(inspection[0]?.reasons, []);
  });
});
