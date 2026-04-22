import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveScenarioEffectInvocations, resolveTurn } from "../../engine";
import type { Choice } from "@/lib/types";
import type { ScenarioPackage } from "@/lib/scenario-dsl";
import type { ScenarioState } from "@/lib/types";

function makeScenarioState(): ScenarioState {
  return {
    scenarioId: "scenario-test",
    sessionId: "session-test",
    turn: 4,
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
    ],
    relationships: [],
    worldVariables: [
      {
        id: "world_tension",
        name: "Regional Tension",
        value: "50",
        kind: "resource",
        minValue: "0",
        maxValue: "100",
      },
    ],
    scenarioObjectTypes: [
      {
        id: "location",
        label: "Location",
        fields: {
          defense: { kind: "number", min: 0, max: 100 },
          status: { kind: "enum", values: ["open", "blocked"] },
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
          status: "open",
        },
      },
    ],
    eventHistory: [],
  };
}

function makeScenarioPackage(): ScenarioPackage {
  return {
    version: 1,
    metadata: {
      title: "Test Package",
    },
    stateExtensions: {
      objectTypes: [],
      objects: [],
    },
    effectDefinitions: [
      {
        id: "fortify_location",
        label: "Fortify Location",
        description: "Strengthen a known location.",
        parameters: {
          actor: { type: "actor", required: true },
          resource: { type: "resource", required: true },
          location: { type: "object", objectType: "location", required: true },
        },
        intensities: {
          moderate: [
            {
              op: "adjustActorResource",
              actor: "$actor",
              resource: "$resource",
              delta: -40,
            },
            {
              op: "adjustObjectField",
              object: "$location",
              field: "defense",
              delta: 20,
            },
            {
              op: "addEvent",
              eventType: "fortification",
              description: "$actor fortifies $location",
              involvedActors: ["$actor"],
            },
          ],
        },
      },
      {
        id: "winter_arrival",
        label: "Winter Arrival",
        description: "Close the pass for winter.",
        parameters: {
          location: { type: "object", objectType: "location", required: true },
        },
        intensities: {
          minor: [
            {
              op: "setObjectField",
              object: "$location",
              field: "status",
              value: "blocked",
            },
          ],
        },
      },
      {
        id: "broken_effect",
        label: "Broken Effect",
        description: "Contains an invalid operation to prove rejection behavior.",
        intensities: {
          minor: [
            {
              op: "setObjectField",
              object: "object_missing",
              field: "status",
              value: "blocked",
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

describe("scenario effect engine helper", () => {
  it("expands and applies effect invocations against cloned state", () => {
    const state = makeScenarioState();
    const scenarioPackage = makeScenarioPackage();

    const result = resolveScenarioEffectInvocations(state, scenarioPackage, [
      {
        effectId: "fortify_location",
        intensity: "moderate",
        bindings: {
          actor: "actor_player",
          resource: "resource_gold",
          location: "object_western_pass",
        },
      },
      {
        effectId: "winter_arrival",
        intensity: "minor",
        bindings: {
          location: "object_western_pass",
        },
      },
    ]);

    assert.equal(result.newState.turn, 5);
    assert.equal(state.turn, 4, "input state should remain unchanged");
    assert.equal(result.appliedInvocations.length, 2);
    assert.equal(result.rejectedInvocations.length, 0);
    assert.equal(result.rejectedOperations.length, 0);
    assert.equal(
      result.newState.actors[0].resources.find((item) => item.id === "resource_gold")
        ?.value,
      80
    );
    assert.equal(
      result.newState.scenarioObjects?.find((item) => item.id === "object_western_pass")
        ?.fields.defense,
      50
    );
    assert.equal(
      result.newState.scenarioObjects?.find((item) => item.id === "object_western_pass")
        ?.fields.status,
      "blocked"
    );
    assert.equal(result.events.length, 1);
    assert.equal(result.newState.eventHistory.length, 1);
    assert.equal(result.stateChanges.length, 3);
  });

  it("separates expansion failures from operation-level rejections", () => {
    const state = makeScenarioState();
    const scenarioPackage = makeScenarioPackage();

    const result = resolveScenarioEffectInvocations(state, scenarioPackage, [
      {
        effectId: "fortify_location",
        intensity: "moderate",
        bindings: {
          actor: "actor_player",
          location: "object_western_pass",
        },
      },
      {
        effectId: "broken_effect",
        intensity: "minor",
        bindings: {},
      },
    ]);

    assert.equal(result.appliedInvocations.length, 1);
    assert.equal(result.rejectedInvocations.length, 1);
    assert.match(result.rejectedInvocations[0]?.reason ?? "", /missing required binding/i);
    assert.equal(result.rejectedOperations.length, 1);
    assert.match(result.rejectedOperations[0]?.reason ?? "", /object not found/i);
    assert.equal(
      result.newState.scenarioObjects?.find((item) => item.id === "object_western_pass")
        ?.fields.status,
      "open"
    );
  });

  it("records selected structured choice execution in resolver debug", async () => {
    const state = makeScenarioState();
    const scenarioPackage = makeScenarioPackage();
    const choice: Choice = {
      id: "fortify_west",
      text: "Fortify Western Pass",
      description: "Strengthen a critical route before winter.",
      source: "fallback",
      debugReasoning: "This improves a visible choke point using available gold.",
      execution: {
        kind: "scenario_effect",
        invocation: {
          effectId: "fortify_location",
          intensity: "moderate",
          bindings: {
            actor: "actor_player",
            resource: "resource_gold",
            location: "object_western_pass",
          },
        },
      },
    };

    const result = await resolveTurn(
      state,
      choice,
      [choice],
      undefined,
      { scenarioPackage }
    );

    assert.equal(result.turn, 5);
    assert.equal(result.resolverSummary?.runtimePath, "scenario_package");
    assert.equal(result.resolverDebug?.choiceExecution?.choiceId, "fortify_west");
    assert.equal(result.resolverDebug?.runtime?.path, "scenario_package");
    assert.equal(result.resolverDebug?.choiceExecution?.mode, "structured");
    assert.equal(
      result.resolverDebug?.choiceExecution?.debugReasoning,
      "This improves a visible choke point using available gold."
    );
    assert.equal(
      result.resolverDebug?.choiceExecution?.debugReasoningSource,
      "fallback"
    );
    assert.equal(result.resolverDebug?.choiceExecution?.effects.length, 1);
    assert.equal(
      result.resolverDebug?.choiceExecution?.effects[0]?.effectId,
      "fortify_location"
    );
  });

  it("reports when package runtime cannot generate any invocations", async () => {
    const state = makeScenarioState();
    const scenarioPackage = makeScenarioPackage();
    const choice: Choice = {
      id: "wait",
      text: "Wait and observe",
      description: "Hold position and gather information.",
    };

    const result = await resolveTurn(
      state,
      choice,
      [choice],
      undefined,
      { scenarioPackage }
    );

    assert.equal(result.resolverSummary?.runtimePath, "scenario_package");
    assert.equal(
      result.resolverSummary?.runtimeNote,
      "scenario_package_llm_generation_failed"
    );
    assert.equal(
      result.resolverDebug?.runtime?.note,
      "scenario_package_llm_generation_failed"
    );
    assert.equal(result.resolverDebug?.effectsReceived.length, 0);
  });

  it("reports when all package invocations are rejected", async () => {
    const state = makeScenarioState();
    const scenarioPackage = makeScenarioPackage();
    const choice: Choice = {
      id: "broken",
      text: "Attempt an invalid fortification",
      description: "Use missing bindings to exercise package rejection handling.",
      execution: {
        kind: "scenario_effect",
        invocation: {
          effectId: "fortify_location",
          intensity: "moderate",
          bindings: {},
        },
      },
    };

    const result = await resolveTurn(
      state,
      choice,
      [choice],
      undefined,
      { scenarioPackage }
    );

    assert.equal(result.resolverSummary?.runtimePath, "scenario_package");
    assert.equal(result.resolverSummary?.fallback, true);
    assert.equal(
      result.resolverSummary?.runtimeNote,
      "scenario_package_all_invocations_rejected"
    );
    assert.equal(
      result.resolverDebug?.runtime?.note,
      "scenario_package_all_invocations_rejected"
    );
    assert.equal(result.resolverDebug?.effectsRejected.length, 1);
  });
});
