import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeAlertFromCode, mergeRuntimeAlerts } from "@/lib/runtime-feedback";
import { buildFallbackNarrative } from "@/lib/simulation/engine";
import type { NarrationGrounding } from "@/lib/simulation/narrative-grounding";

describe("runtime feedback helpers", () => {
  it("maps known runtime codes to operator-facing alerts", () => {
    const alert = buildRuntimeAlertFromCode(
      "scenario_package_choice_generation_failed"
    );

    assert.equal(alert.stage, "turn_resolution");
    assert.equal(alert.severity, "warning");
    assert.match(alert.summary, /Choice effect generation failed/);
    assert.equal(alert.retryable, true);
  });

  it("deduplicates runtime alerts by code", () => {
    const merged = mergeRuntimeAlerts(
      [buildRuntimeAlertFromCode("page_narration_generation_failed")],
      [
        buildRuntimeAlertFromCode("page_narration_generation_failed"),
        buildRuntimeAlertFromCode("choice_regeneration_failed"),
      ]
    );

    assert.deepEqual(
      merged.map((alert) => alert.code),
      ["page_narration_generation_failed", "choice_regeneration_failed"]
    );
  });

  it("builds deterministic fallback narrative from visible outcomes", () => {
    const grounding: NarrationGrounding = {
      playerChoice: {
        text: "Fortify the western pass",
      },
      actorActions: [
        {
          actorName: "Rival Envoy",
          action: "Demands an explanation at the border.",
        },
      ],
      visibleStateChanges: [
        {
          type: "resource",
          target: "Treasury",
          field: "gold",
          oldValue: 120,
          newValue: 80,
          reason: "Effect: fortify_location",
        },
      ],
      visibleEvents: [
        {
          id: "event_1_effect_fortify_location",
          turn: 1,
          type: "defense",
          description: "Western Pass fortifications increase.",
          involvedActors: [],
        },
      ],
      stateSummary: {
        playerResources: [],
        keyActors: [],
        activeTensions: [],
        worldState: [],
      },
      resolverSummary: {
        effectsApplied: ["fortify_location (moderate)"],
        clamped: [],
        rejected: [],
        runtimePath: "scenario_package",
      },
    };

    const narrative = buildFallbackNarrative(grounding);

    assert.equal(narrative.playerAction, "Fortify the western pass");
    assert.match(narrative.consequences, /Treasury: 120 -> 80/);
    assert.equal(narrative.otherActions[0]?.actor, "Rival Envoy");
    assert.match(narrative.worldUpdate, /Western Pass fortifications increase/);
  });
});
