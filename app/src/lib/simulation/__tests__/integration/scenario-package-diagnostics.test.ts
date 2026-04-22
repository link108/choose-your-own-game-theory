import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diagnoseScenarioPackage } from "@/lib/scenario-dsl";

const context = {
  actorIds: ["actor_player", "actor_rival"],
  resourceIds: ["resource_gold", "resource_troops"],
  worldVariableIds: ["world_season", "world_countdown"],
  relationshipIds: ["rel_player_rival"],
};

describe("scenario package diagnostics", () => {
  it("flags authoring gaps that weaken package-backed runtime behavior", () => {
    const result = diagnoseScenarioPackage(
      {
        version: 1,
        metadata: {
          title: "Thin Package",
        },
        stateExtensions: {
          objectTypes: [
            {
              id: "location",
              label: "Location",
              fields: {
                secret: {
                  kind: "string",
                  visible: false,
                },
              },
            },
          ],
          objects: [
            {
              id: "hidden_cache",
              typeId: "location",
              name: "Hidden Cache",
              visibility: "hidden",
              fields: {
                secret: "stash",
              },
            },
          ],
        },
        effectDefinitions: [
          {
            id: "unused_effect",
            label: "Unused Effect",
            description: "Never wired into the package.",
            intensities: {
              moderate: [],
            },
          },
        ],
        triggerRules: [
          {
            id: "empty_trigger",
            when: {},
            operations: [
              {
                op: "addEvent",
                eventType: "warning",
                description: "This never fires.",
              },
            ],
          },
          {
            id: "object_trigger_without_field",
            when: {
              object: "hidden_cache",
              equals: "stash",
            },
            operations: [
              {
                op: "addEvent",
                eventType: "warning",
                description: "Also never fires.",
              },
            ],
          },
        ],
        choicePolicy: {
          minChoices: 2,
          maxChoices: 4,
        },
      },
      context
    );

    assert.equal(result.healthy, false);
    assert.ok(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === "choice_policy_has_no_preferred_effects"
      )
    );
    assert.ok(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === "actor_capabilities_missing"
      )
    );
    assert.ok(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === "effect_has_no_operations"
      )
    );
    assert.ok(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === "effect_not_referenced_by_policy_or_capabilities"
      )
    );
    assert.ok(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === "trigger_rule_has_no_target"
      )
    );
    assert.ok(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === "trigger_rule_object_missing_field"
      )
    );
    assert.ok(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === "hidden_object_has_no_visible_fields"
      )
    );
  });

  it("reports a healthy package when coverage and guidance are present", () => {
    const result = diagnoseScenarioPackage(
      {
        version: 1,
        metadata: {
          title: "Operational Package",
        },
        stateExtensions: {
          objectTypes: [
            {
              id: "location",
              label: "Location",
              fields: {
                defense: {
                  kind: "number",
                  visible: true,
                },
              },
            },
          ],
          objects: [
            {
              id: "frontier_keep",
              typeId: "location",
              name: "Frontier Keep",
              visibility: "revealed",
              fields: {
                defense: 20,
              },
            },
          ],
        },
        effectDefinitions: [
          {
            id: "fortify_location",
            label: "Fortify",
            description: "Improve a defended site.",
            parameters: {
              location: {
                type: "object",
                objectType: "location",
                required: true,
              },
            },
            intensities: {
              moderate: [
                {
                  op: "adjustObjectField",
                  object: "$location",
                  field: "defense",
                  delta: 5,
                },
              ],
            },
          },
        ],
        actorCapabilities: [
          {
            actorId: "actor_player",
            effectIds: ["fortify_location"],
          },
          {
            actorId: "actor_rival",
            effectIds: ["fortify_location"],
          },
        ],
        triggerRules: [
          {
            id: "winter_warning",
            when: {
              worldVariable: "world_countdown",
              lte: 0,
            },
            operations: [
              {
                op: "addEvent",
                eventType: "warning",
                description: "Winter arrives.",
              },
            ],
          },
        ],
        choicePolicy: {
          minChoices: 3,
          maxChoices: 5,
          preferredEffectIds: ["fortify_location"],
        },
      },
      context
    );

    assert.equal(result.healthy, true);
    assert.deepEqual(result.diagnostics, []);
  });
});
