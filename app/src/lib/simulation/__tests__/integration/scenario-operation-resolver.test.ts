import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyScenarioOperations,
  expandScenarioEffect,
} from "@/lib/scenario-dsl";
import type { ScenarioState } from "@/lib/types";
import type { ScenarioPackage } from "@/lib/scenario-dsl";

function makeScenarioState(): ScenarioState {
  return {
    scenarioId: "scenario-test",
    sessionId: "session-test",
    turn: 3,
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
    relationships: [
      {
        id: "rel_player_rival",
        fromActorId: "actor_player",
        toActorId: "actor_rival",
        type: "rival",
        strength: 35,
        description: null,
      },
    ],
    worldVariables: [
      {
        id: "world_tension",
        name: "Regional Tension",
        value: "50",
        kind: "resource",
        minValue: "0",
        maxValue: "100",
      },
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
          status: {
            kind: "enum",
            values: ["open", "blocked"],
          },
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
        id: "create_obligation",
        label: "Create Obligation",
        description: "Create an obligation object for two parties.",
        parameters: {
          debtor: { type: "actor", required: true },
          creditor: { type: "actor", required: true },
        },
        intensities: {
          minor: [
            {
              op: "createObject",
              object: {
                id: "object_obligation_$debtor",
                typeId: "location",
                name: "Marker for $debtor",
                visibility: "revealed",
                fields: {
                  defense: 1,
                  status: "open",
                },
              },
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

describe("scenario operation resolver", () => {
  it("applies actor resource and world variable operations", () => {
    const state = makeScenarioState();

    const result = applyScenarioOperations(state, [
      {
        op: "adjustActorResource",
        actor: "actor_player",
        resource: "resource_gold",
        delta: -40,
      },
      {
        op: "adjustWorldVariable",
        variable: "world_tension",
        delta: 15,
      },
      {
        op: "setWorldVariable",
        variable: "world_season",
        value: "Winter",
      },
    ]);

    assert.equal(result.rejectedOperations.length, 0);
    assert.equal(state.actors[0].resources[0].value, 80);
    assert.equal(
      state.worldVariables.find((item) => item.id === "world_tension")?.value,
      "65"
    );
    assert.equal(
      state.worldVariables.find((item) => item.id === "world_season")?.value,
      "Winter"
    );
    assert.equal(result.stateChanges.length, 3);
  });

  it("applies scenario object field and visibility operations", () => {
    const state = makeScenarioState();

    const result = applyScenarioOperations(state, [
      {
        op: "adjustObjectField",
        object: "object_western_pass",
        field: "defense",
        delta: 20,
      },
      {
        op: "setObjectField",
        object: "object_western_pass",
        field: "status",
        value: "blocked",
      },
      {
        op: "hideObject",
        object: "object_western_pass",
      },
    ]);

    const pass = state.scenarioObjects?.find(
      (item) => item.id === "object_western_pass"
    );

    assert.equal(result.rejectedOperations.length, 0);
    assert.equal(pass?.fields.defense, 50);
    assert.equal(pass?.fields.status, "blocked");
    assert.equal(pass?.visibility, "hidden");
    assert.equal(result.stateChanges.length, 3);
  });

  it("creates scenario objects and events", () => {
    const state = makeScenarioState();

    const result = applyScenarioOperations(state, [
      {
        op: "createObject",
        object: {
          id: "object_loan",
          typeId: "location",
          name: "Temporary Object",
          visibility: "revealed",
          fields: {
            defense: 5,
            status: "open",
          },
        },
      },
      {
        op: "addEvent",
        eventType: "agreement",
        description: "A new agreement has been signed.",
        involvedActors: ["actor_player"],
      },
    ]);

    assert.equal(result.rejectedOperations.length, 0);
    assert.equal(state.scenarioObjects?.length, 2);
    assert.equal(state.eventHistory.length, 1);
    assert.equal(state.eventHistory[0].type, "agreement");
    assert.equal(result.events.length, 1);
  });

  it("rejects invalid operations without mutating state", () => {
    const state = makeScenarioState();

    const result = applyScenarioOperations(state, [
      {
        op: "adjustObjectField",
        object: "object_western_pass",
        field: "status",
        delta: 10,
      },
      {
        op: "setActorResource",
        actor: "actor_missing",
        resource: "resource_gold",
        value: 50,
      },
    ]);

    assert.equal(result.appliedOperations.length, 0);
    assert.equal(result.rejectedOperations.length, 2);
    assert.equal(
      state.scenarioObjects?.find((item) => item.id === "object_western_pass")?.fields
        .status,
      "open"
    );
    assert.equal(state.actors[0].resources[0].value, 120);
  });

  it("expands effect bindings into concrete operations", () => {
    const state = makeScenarioState();
    const scenarioPackage = makeScenarioPackage();

    const result = expandScenarioEffect(state, scenarioPackage, {
      effectId: "fortify_location",
      intensity: "moderate",
      bindings: {
        actor: "actor_player",
        resource: "resource_gold",
        location: "object_western_pass",
      },
    });

    assert.equal(result.rejected, undefined);
    assert.equal(result.operations.length, 3);
    assert.deepEqual(result.operations[0], {
      op: "adjustActorResource",
      actor: "actor_player",
      resource: "resource_gold",
      delta: -40,
    });
    assert.deepEqual(result.operations[1], {
      op: "adjustObjectField",
      object: "object_western_pass",
      field: "defense",
      delta: 20,
    });
  });

  it("rejects effect expansion when required bindings are missing or wrong", () => {
    const state = makeScenarioState();
    const scenarioPackage = makeScenarioPackage();

    const missing = expandScenarioEffect(state, scenarioPackage, {
      effectId: "fortify_location",
      intensity: "moderate",
      bindings: {
        actor: "actor_player",
        location: "object_western_pass",
      },
    });

    const wrongType = expandScenarioEffect(state, scenarioPackage, {
      effectId: "fortify_location",
      intensity: "moderate",
      bindings: {
        actor: "actor_player",
        resource: "resource_gold",
        location: "actor_player",
      },
    });

    assert.match(missing.rejected ?? "", /missing required binding/i);
    assert.match(wrongType.rejected ?? "", /scenario object binding not found/i);
  });

  it("applies expanded effect operations end to end", () => {
    const state = makeScenarioState();
    const scenarioPackage = makeScenarioPackage();

    const expansion = expandScenarioEffect(state, scenarioPackage, {
      effectId: "fortify_location",
      intensity: "moderate",
      bindings: {
        actor: "actor_player",
        resource: "resource_gold",
        location: "object_western_pass",
      },
    });

    assert.equal(expansion.rejected, undefined);

    const result = applyScenarioOperations(state, expansion.operations, {
      reason: "Effect: fortify_location",
    });

    assert.equal(result.rejectedOperations.length, 0);
    assert.equal(state.actors[0].resources[0].value, 80);
    assert.equal(
      state.scenarioObjects?.find((item) => item.id === "object_western_pass")?.fields
        .defense,
      50
    );
    assert.equal(state.eventHistory.length, 1);
    assert.match(state.eventHistory[0].description, /actor_player fortifies object_western_pass/i);
  });

  it("expands createObject templates with bound identifiers", () => {
    const state = makeScenarioState();
    state.actors.push({
      id: "actor_creditor",
      name: "Lyra",
      description: "Creditor actor",
      goals: [],
      traits: [],
      isPlayer: false,
      resources: [],
    });

    const scenarioPackage = makeScenarioPackage();
    const expansion = expandScenarioEffect(state, scenarioPackage, {
      effectId: "create_obligation",
      intensity: "minor",
      bindings: {
        debtor: "actor_player",
        creditor: "actor_creditor",
      },
    });

    assert.equal(expansion.rejected, undefined);
    assert.equal(expansion.operations.length, 1);
    const op = expansion.operations[0];
    assert.equal(op.op, "createObject");
    if (op.op === "createObject") {
      assert.equal(op.object.id, "object_obligation_actor_player");
      assert.equal(op.object.name, "Marker for actor_player");
    }
  });
});
