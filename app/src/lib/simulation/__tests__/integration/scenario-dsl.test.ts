import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildScenarioStateExtensions,
  validateScenarioPackage,
} from "@/lib/scenario-dsl";

const context = {
  actorIds: ["actor_player", "actor_rival"],
  resourceIds: ["resource_gold", "resource_troops"],
  worldVariableIds: ["world_season", "world_countdown"],
  relationshipIds: ["rel_player_rival"],
};

const validPackage = {
  version: 1,
  metadata: {
    title: "Border Crisis",
  },
  stateExtensions: {
    objectTypes: [
      {
        id: "location",
        label: "Location",
        fields: {
          controller: { kind: "string", required: true },
          defense: { kind: "number", min: 0, max: 100, required: true },
          status: {
            kind: "enum",
            values: ["open", "blocked", "snowbound"],
            required: true,
          },
        },
      },
    ],
    objects: [
      {
        id: "object_western_pass",
        typeId: "location",
        name: "Western Pass",
        visibility: "visible",
        fields: {
          controller: "actor_player",
          defense: 30,
          status: "open",
        },
      },
    ],
  },
  effectDefinitions: [
    {
      id: "fortify_location",
      label: "Fortify Location",
      description: "Spend resources to improve a known position.",
      parameters: {
        actor: { type: "actor", required: true },
        location: { type: "object", objectType: "location", required: true },
      },
      intensities: {
        moderate: [
          {
            op: "adjustActorResource",
            actor: "$actor",
            resource: "resource_gold",
            delta: -80,
          },
          {
            op: "adjustObjectField",
            object: "$location",
            field: "defense",
            delta: 25,
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
  ],
  triggerRules: [
    {
      id: "season_turns",
      when: {
        worldVariable: "world_countdown",
        lte: 0,
      },
      operations: [
        {
          op: "setWorldVariable",
          variable: "world_season",
          value: "Winter",
        },
      ],
    },
  ],
  choicePolicy: {
    minChoices: 3,
    maxChoices: 5,
    preferredEffectIds: ["fortify_location"],
  },
};

describe("scenario DSL validation", () => {
  it("accepts a valid package with parameterized effect operations", () => {
    const result = validateScenarioPackage(validPackage, context);

    assert.equal(result.valid, true);
    assert.deepEqual(
      result.issues.filter((issue) => issue.severity === "error"),
      []
    );
    assert.equal(result.package?.effectDefinitions[0].id, "fortify_location");
  });

  it("rejects duplicate ids and unknown effect references", () => {
    const invalid = {
      ...validPackage,
      stateExtensions: {
        ...validPackage.stateExtensions,
        objects: [
          ...validPackage.stateExtensions.objects,
          {
            ...validPackage.stateExtensions.objects[0],
            name: "Duplicate Western Pass",
          },
        ],
      },
      choicePolicy: {
        minChoices: 2,
        maxChoices: 4,
        preferredEffectIds: ["missing_effect"],
      },
    };

    const result = validateScenarioPackage(invalid, context);

    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((issue) => issue.message.includes("Duplicate id"))
    );
    assert.ok(
      result.issues.some((issue) => issue.message.includes("missing_effect"))
    );
  });

  it("rejects object field values that violate their object type", () => {
    const invalid = {
      ...validPackage,
      stateExtensions: {
        ...validPackage.stateExtensions,
        objects: [
          {
            ...validPackage.stateExtensions.objects[0],
            fields: {
              ...validPackage.stateExtensions.objects[0].fields,
              defense: 120,
              status: "teleporting",
            },
          },
        ],
      },
    };

    const result = validateScenarioPackage(invalid, context);

    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((issue) => issue.message === "Value is above max")
    );
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes("Value must be one of")
      )
    );
  });

  it("rejects operations that reference unknown parameters", () => {
    const invalid = {
      ...validPackage,
      effectDefinitions: [
        {
          ...validPackage.effectDefinitions[0],
          intensities: {
            moderate: [
              {
                op: "adjustActorResource",
                actor: "$missing",
                resource: "resource_gold",
                delta: -10,
              },
            ],
          },
        },
      ],
    };

    const result = validateScenarioPackage(invalid, context);

    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes('Unknown parameter reference "$missing"')
      )
    );
  });

  it("rejects object-field operations that point at missing or incompatible fields", () => {
    const invalid = {
      ...validPackage,
      effectDefinitions: [
        {
          ...validPackage.effectDefinitions[0],
          intensities: {
            moderate: [
              {
                op: "setObjectField",
                object: "$location",
                field: "unknown_field",
                value: "blocked",
              },
              {
                op: "adjustObjectField",
                object: "$location",
                field: "status",
                delta: 1,
              },
            ],
          },
        },
      ],
      triggerRules: [
        {
          ...validPackage.triggerRules[0],
          when: {
            object: "object_western_pass",
            field: "status",
            lte: 0,
          },
        },
      ],
    };

    const result = validateScenarioPackage(invalid, context);

    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes('Unknown object field "unknown_field"')
      )
    );
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes('Object field "status" must be numeric')
      )
    );
  });

  it("rejects parameter references when the parameter type is incompatible", () => {
    const invalid = {
      ...validPackage,
      effectDefinitions: [
        {
          ...validPackage.effectDefinitions[0],
          intensities: {
            moderate: [
              {
                op: "adjustActorResource",
                actor: "$location",
                resource: "resource_gold",
                delta: -10,
              },
            ],
          },
        },
      ],
    };

    const result = validateScenarioPackage(invalid, context);

    assert.equal(result.valid, false);
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes(
          'Parameter reference "$location" must be typed as actor'
        )
      )
    );
  });

  it("builds an isolated runtime state extension snapshot", () => {
    const result = validateScenarioPackage(validPackage, context);
    assert.equal(result.valid, true);

    const snapshot = buildScenarioStateExtensions(result.package);

    assert.equal(snapshot.scenarioObjectTypes.length, 1);
    assert.equal(snapshot.scenarioObjects.length, 1);
    assert.equal(snapshot.scenarioObjects[0].name, "Western Pass");

    snapshot.scenarioObjects[0].fields.status = "blocked";

    const secondSnapshot = buildScenarioStateExtensions(result.package);
    assert.equal(secondSnapshot.scenarioObjects[0].fields.status, "open");
  });
});
