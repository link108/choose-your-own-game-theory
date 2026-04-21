import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getStubScenarioChoices } from "../../stub-actors";
import type { ScenarioPackage } from "@/lib/scenario-dsl";
import type { ScenarioState } from "@/lib/types";

function makeScenarioState(): ScenarioState {
  return {
    scenarioId: "scenario-test",
    sessionId: "session-test",
    turn: 5,
    actors: [
      {
        id: "actor_player",
        name: "Duke Aldric",
        description: "Player actor",
        goals: [],
        traits: [],
        isPlayer: true,
        resources: [
          {
            id: "resource_gold",
            name: "Gold",
            value: 120,
            minValue: 0,
            maxValue: 1000,
          },
          {
            id: "resource_food",
            name: "Food",
            value: 300,
            minValue: 0,
            maxValue: 5000,
          },
        ],
      },
      {
        id: "actor_themis",
        name: "Archon Lyra",
        description: "Trade partner",
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
        fields: {
          defense: { kind: "number", min: 0, max: 100 },
        },
      },
    ],
    scenarioObjects: [
      {
        id: "object_western_pass",
        typeId: "location",
        name: "Western Pass",
        visibility: "visible",
        fields: {
          defense: 30,
        },
      },
    ],
    eventHistory: [],
  };
}

function makeScenarioPackage(): ScenarioPackage {
  return {
    version: 1,
    metadata: { title: "Choice Test" },
    stateExtensions: {
      objectTypes: [],
      objects: [],
    },
    effectDefinitions: [
      {
        id: "fortify_location",
        label: "Fortify Location",
        description: "Spend resources to improve defenses at a known scenario location.",
        parameters: {
          actor: { type: "actor", required: true },
          location: { type: "object", objectType: "location", required: true },
        },
        intensities: {
          moderate: [],
        },
      },
      {
        id: "negotiate_trade_terms",
        label: "Negotiate Trade Terms",
        description: "Create or improve a trade relationship between two actors.",
        parameters: {
          actor: { type: "actor", required: true },
          partner: { type: "actor", required: true },
        },
        intensities: {
          moderate: [],
        },
      },
      {
        id: "request_loan",
        label: "Request Loan",
        description: "Take on a financial obligation in exchange for immediate gold.",
        parameters: {
          debtor: { type: "actor", required: true },
          creditor: { type: "actor", required: true },
        },
        intensities: {
          minor: [],
        },
      },
    ],
    choicePolicy: {
      minChoices: 3,
      maxChoices: 5,
      preferredEffectIds: [
        "fortify_location",
        "negotiate_trade_terms",
        "request_loan",
      ],
    },
  };
}

describe("scenario package choice fallback", () => {
  it("builds scenario-aware choices from preferred effect definitions", () => {
    const state = makeScenarioState();
    const scenarioPackage = makeScenarioPackage();

    const choices = getStubScenarioChoices(state, scenarioPackage);

    assert.equal(choices.length, 3);
    assert.match(choices[0]?.text ?? "", /Fortify Location/i);
    assert.match(choices[0]?.text ?? "", /Western Pass/i);
    assert.equal(choices[0]?.source, "fallback");
    assert.equal(choices[0]?.debugReasoningSource, "fallback");
    assert.equal(choices[0]?.execution?.kind, "scenario_effect");
    assert.equal(
      choices[0]?.execution?.invocation.effectId,
      "fortify_location"
    );
    assert.match(choices[1]?.text ?? "", /Negotiate Trade Terms/i);
    assert.match(choices[1]?.text ?? "", /Archon Lyra/i);
    assert.match(choices[2]?.text ?? "", /Request Loan/i);
  });

  it("avoids repeating previous choice text when generating fallback choices", () => {
    const state = makeScenarioState();
    const scenarioPackage = makeScenarioPackage();

    const choices = getStubScenarioChoices(state, scenarioPackage, [
      {
        id: "old_choice",
        text: "Fortify Location at Western Pass",
        description: "old",
      },
    ]);

    assert.ok(
      choices.every((choice) => choice.text !== "Fortify Location at Western Pass")
    );
  });
});
