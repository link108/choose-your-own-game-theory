import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildScenarioLaunchReadiness,
  buildScenarioReviewSections,
  buildScenarioReviewScore,
} from "@/lib/scenario-review";
import type { ScenarioData } from "@/components/scenario/types";

function makeScenario(overrides: Partial<ScenarioData> = {}): ScenarioData {
  return {
    id: "scenario_1",
    name: "Frontier",
    description: "Hold the line at the border.",
    worldDescription: "Winter is approaching and every faction is watching.",
    status: "DRAFT",
    scenarioPackage: { version: 1 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    actors: [
      {
        id: "actor_player",
        scenarioId: "scenario_1",
        name: "Warden",
        description: "Defends the pass.",
        goals: [],
        traits: [],
        isPlayer: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resources: [],
        relationshipsFrom: [],
        relationshipsTo: [],
      },
      {
        id: "actor_rival",
        scenarioId: "scenario_1",
        name: "Envoy",
        description: "Applies pressure.",
        goals: [],
        traits: [],
        isPlayer: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resources: [],
        relationshipsFrom: [],
        relationshipsTo: [],
      },
    ],
    worldVariables: [],
    ...overrides,
  };
}

describe("scenario review readiness", () => {
  it("blocks launch when the package is missing or invalid", () => {
    const readiness = buildScenarioLaunchReadiness(makeScenario({ scenarioPackage: null }), {
      valid: false,
      issues: [
        {
          severity: "error",
          path: "choicePolicy.preferredEffectIds",
          message: 'Unknown effect "missing_effect"',
        },
      ],
      diagnostics: [],
    });

    assert.equal(readiness.ready, false);
    assert.ok(
      readiness.blockers.some((issue) =>
        issue.message.includes("No scenario package is attached")
      )
    );
    assert.ok(
      readiness.blockers.some((issue) => issue.category === "package_validity")
    );
    assert.ok(
      readiness.blockers.some((issue) =>
        issue.message.includes('Unknown effect "missing_effect"')
      )
    );
  });

  it("surfaces diagnostics as launch warnings when the package is valid", () => {
    const readiness = buildScenarioLaunchReadiness(makeScenario(), {
      valid: true,
      issues: [],
      diagnostics: [
        {
          severity: "warning",
          code: "actor_capabilities_missing",
          path: "actorCapabilities",
          message: "No actor capabilities are defined.",
          recommendation: "Add actor capability entries.",
        },
      ],
    });

    assert.equal(readiness.ready, true);
    assert.deepEqual(readiness.blockers, []);
    assert.ok(
      readiness.warnings.some((issue) =>
        issue.message.includes("Add actor capability entries")
      )
    );
    assert.ok(
      readiness.warnings.some((issue) => issue.category === "runtime_risks")
    );
  });

  it("groups readiness issues into structured review sections", () => {
    const readiness = buildScenarioLaunchReadiness(
      makeScenario({ worldDescription: "", scenarioPackage: null }),
      {
        valid: false,
        issues: [
          {
            severity: "warning",
            path: "stateExtensions.objects.keep.fields.extra",
            message: "Field is not defined by the object type",
          },
        ],
        diagnostics: [
          {
            severity: "warning",
            code: "trigger_rule_has_no_target",
            path: "triggerRules.alert.when",
            message: "Trigger rule has no target.",
            recommendation: "Define a target.",
          },
        ],
      }
    );

    const sections = buildScenarioReviewSections(readiness);

    const launchSetup = sections.find((section) => section.id === "launch_setup");
    const packageValidity = sections.find(
      (section) => section.id === "package_validity"
    );
    const runtimeRisks = sections.find(
      (section) => section.id === "runtime_risks"
    );
    const authoringQuality = sections.find(
      (section) => section.id === "authoring_quality"
    );

    assert.ok(launchSetup);
    assert.equal(launchSetup.blockers.length, 0);
    assert.ok(packageValidity);
    assert.ok(
      packageValidity.blockers.some((issue) =>
        issue.message.includes("No scenario package is attached")
      )
    );
    assert.ok(
      packageValidity.warnings.some((issue) =>
        issue.message.includes("Field is not defined by the object type")
      )
    );
    assert.ok(runtimeRisks);
    assert.ok(
      runtimeRisks.warnings.some((issue) =>
        issue.message.includes("Trigger rule has no target")
      )
    );
    assert.ok(authoringQuality);
    assert.ok(
      authoringQuality.warnings.some((issue) =>
        issue.message.includes("World description is empty")
      )
    );
    assert.equal(packageValidity.suggestedTab, "package");
  });

  it("computes a readiness score from blockers and warnings", () => {
    const readiness = buildScenarioLaunchReadiness(
      makeScenario({ worldDescription: "", scenarioPackage: null }),
      {
        valid: true,
        issues: [],
        diagnostics: [
          {
            severity: "warning",
            code: "choice_policy_has_no_preferred_effects",
            path: "choicePolicy.preferredEffectIds",
            message: "Choice policy has no preferred effects.",
          },
        ],
      }
    );

    const score = buildScenarioReviewScore(readiness);

    assert.equal(score.label, "Needs Work");
    assert.equal(score.score, 65);
  });
});
