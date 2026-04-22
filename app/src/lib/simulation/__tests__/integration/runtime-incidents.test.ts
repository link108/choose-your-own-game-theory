import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeRuntimeIncidents, extractRuntimeAlerts } from "@/lib/runtime-incidents";
import { buildRuntimeAlertFromCode } from "@/lib/runtime-feedback";

describe("runtime incidents", () => {
  it("extracts persisted runtime alerts from resolver logs", () => {
    const alerts = extractRuntimeAlerts({
      runtime: {
        path: "scenario_package",
        alerts: [
          buildRuntimeAlertFromCode("page_narration_generation_failed"),
          buildRuntimeAlertFromCode("page_narration_generation_failed"),
        ],
      },
    });

    assert.deepEqual(
      alerts.map((alert) => alert.code),
      ["page_narration_generation_failed"]
    );
  });

  it("falls back to runtime notes when explicit alerts are absent", () => {
    const alerts = extractRuntimeAlerts({
      runtime: {
        path: "scenario_package",
        note: "scenario_package_actor_generation_failed",
      },
    });

    assert.deepEqual(
      alerts.map((alert) => alert.code),
      ["scenario_package_actor_generation_failed"]
    );
  });

  it("summarizes degraded turns across a session", () => {
    const summary = summarizeRuntimeIncidents([
      {
        turnNumber: 1,
        playerChoiceText: null,
        renderedPage: { title: "Opening" },
        resolverLog: null,
      },
      {
        turnNumber: 2,
        playerChoiceText: "Fortify the pass",
        renderedPage: { title: "Defenses Rise" },
        resolverLog: {
          runtime: {
            path: "scenario_package",
            alerts: [
              buildRuntimeAlertFromCode("scenario_package_actor_generation_failed"),
              buildRuntimeAlertFromCode("page_narration_generation_failed"),
            ],
          },
        },
      },
      {
        turnNumber: 3,
        playerChoiceText: "Demand tribute",
        renderedPage: { title: "Talks Fracture" },
        resolverLog: {
          runtime: {
            path: "scenario_package",
            note: "scenario_package_actor_generation_failed",
          },
        },
      },
    ]);

    assert.equal(summary.totalIncidentTurns, 2);
    assert.equal(summary.totalIncidents, 3);
    assert.deepEqual(summary.countsByCode, [
      { code: "scenario_package_actor_generation_failed", count: 2 },
      { code: "page_narration_generation_failed", count: 1 },
    ]);
    assert.equal(summary.incidentsByTurn[0]?.turnNumber, 2);
    assert.equal(summary.incidentsByTurn[2]?.turnNumber, 3);
  });
});
