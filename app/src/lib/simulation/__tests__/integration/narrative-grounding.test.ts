import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ScenarioState, TurnResult } from "@/lib/types";
import {
  buildGroundedPageTitle,
  buildNarrationGrounding,
} from "@/lib/simulation/narrative-grounding";

function createState(): ScenarioState {
  return {
    scenarioId: "scenario_test",
    sessionId: "session_test",
    turn: 2,
    actors: [
      {
        id: "actor_player",
        name: "Commander",
        description: "Holds the line",
        goals: ["Protect the pass"],
        traits: ["steady"],
        isPlayer: true,
        resources: [
          {
            id: "resource_gold",
            name: "Gold",
            value: 100,
            minValue: 0,
            maxValue: 500,
          },
        ],
      },
      {
        id: "actor_rival",
        name: "Envoy",
        description: "Tests your resolve",
        goals: ["Break the stalemate"],
        traits: ["patient"],
        isPlayer: false,
        resources: [],
      },
    ],
    relationships: [
      {
        id: "rel_player_rival",
        fromActorId: "actor_rival",
        toActorId: "actor_player",
        type: "rival",
        strength: 20,
        description: null,
      },
    ],
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
          status: {
            kind: "enum",
            values: ["open", "blocked"],
            required: true,
            visible: true,
          },
          secret_plan: {
            kind: "string",
            visible: false,
          },
        },
      },
    ],
    scenarioObjects: [
      {
        id: "object_pass",
        typeId: "location",
        name: "Western Pass",
        visibility: "visible",
        fields: {
          status: "open",
          secret_plan: "Hold until winter",
        },
      },
      {
        id: "object_cache",
        typeId: "location",
        name: "Hidden Cache",
        visibility: "hidden",
        fields: {
          status: "blocked",
          secret_plan: "Smuggled supplies",
        },
      },
    ],
    eventHistory: [],
  };
}

describe("narrative grounding", () => {
  it("filters hidden object changes and internal trigger events from narration facts", () => {
    const previousState = createState();
    const newState = createState();
    newState.turn = 3;
    newState.worldVariables[0].value = "Winter";
    newState.scenarioObjects![0].fields.status = "blocked";
    newState.scenarioObjects![0].fields.secret_plan = "Abandon the fort";
    newState.scenarioObjects![1].visibility = "revealed";
    newState.scenarioObjects![1].fields.secret_plan = "Now visible internally only";

    const turnResult: TurnResult = {
      turn: 3,
      playerChoice: {
        id: "fortify",
        text: "Fortify the pass",
      },
      stateChanges: [
        {
          type: "scenarioObject",
          target: "Western Pass",
          field: "status",
          oldValue: "open",
          newValue: "blocked",
          reason: "Effect: fortify_pass",
        },
        {
          type: "scenarioObject",
          target: "Western Pass",
          field: "secret_plan",
          oldValue: "Hold until winter",
          newValue: "Abandon the fort",
          reason: "Effect: fortify_pass",
        },
        {
          type: "scenarioObject",
          target: "Hidden Cache",
          field: "visibility",
          oldValue: "hidden",
          newValue: "revealed",
          reason: "Effect: uncover_cache",
        },
        {
          type: "worldVariable",
          target: "Season",
          field: "value",
          oldValue: "Autumn",
          newValue: "Winter",
          reason: "Trigger: season_turns",
        },
      ],
      events: [
        {
          id: "event_3_player",
          turn: 3,
          type: "defense",
          description: "You decided to fortify the pass.",
          involvedActors: ["actor_player"],
        },
        {
          id: "event_3_trigger",
          turn: 3,
          type: "trigger_rule",
          description: "Trigger rule fired: season_turns",
          involvedActors: [],
        },
      ],
      actorResponses: [
        {
          actorId: "actor_rival",
          actorName: "Envoy",
          action: "The envoy slows his advance.",
          reasoning: "He privately expects your supplies to fail.",
          proposedChanges: [],
        },
      ],
      newState,
    };

    const grounding = buildNarrationGrounding(previousState, turnResult);

    assert.deepEqual(
      grounding.visibleStateChanges.map((change) => change.field),
      ["status", "visibility", "value"]
    );
    assert.equal(grounding.visibleEvents.length, 1);
    assert.equal(grounding.visibleEvents[0]?.type, "defense");
    assert.equal(grounding.actorActions[0]?.action, "The envoy slows his advance.");
  });

  it("derives titles from committed visible outcomes", () => {
    const previousState = createState();
    const newState = createState();
    newState.turn = 3;
    newState.scenarioObjects![1].visibility = "revealed";

    const grounding = buildNarrationGrounding(previousState, {
      turn: 3,
      playerChoice: {
        id: "search",
        text: "Search the ridge",
      },
      stateChanges: [
        {
          type: "scenarioObject",
          target: "Hidden Cache",
          field: "visibility",
          oldValue: "hidden",
          newValue: "revealed",
          reason: "Effect: uncover_cache",
        },
      ],
      events: [
        {
          id: "event_3_player",
          turn: 3,
          type: "intelligence",
          description: "You decided to search the ridge.",
          involvedActors: ["actor_player"],
        },
      ],
      actorResponses: [],
      newState,
    });

    assert.equal(buildGroundedPageTitle(grounding), "Hidden Cache Revealed");
  });
});
