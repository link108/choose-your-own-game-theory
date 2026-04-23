import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildScenarioPackageDraftCritique,
  buildScenarioPackageDraftPrompt,
  finalizeScenarioPackageDraft,
} from "@/lib/scenario-dsl/draft-generation";

const validationContext = {
  actorIds: ["actor_player", "actor_rival"],
  resourceIds: ["resource_gold", "resource_troops"],
  worldVariableIds: ["world_season", "world_countdown"],
  relationshipIds: ["rel_player_rival"],
};

const validPackage = {
  version: 1,
  metadata: {
    title: "Border Crisis",
    summary: "A border standoff between two powers.",
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
    {
      actorId: "actor_rival",
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

describe("scenario package draft generation helpers", () => {
  it("builds a prompt that includes author intent and current scenario context", () => {
    const prompt = buildScenarioPackageDraftPrompt({
      authorPrompt: "Create a tense frontier-defense package.",
      validationContext,
      scenario: {
        name: "Frontier",
        description: "A tense border stand-off.",
        worldDescription: "Winter may arrive soon.",
        actors: [
          {
            id: "actor_player",
            name: "Warden",
            description: "Defends the pass",
            goals: ["Hold the line"],
            traits: ["cautious"],
            isPlayer: true,
            resources: [
              {
                id: "resource_gold",
                name: "Gold",
                value: 120,
                minValue: 0,
                maxValue: 300,
              },
            ],
            relationshipsFrom: [],
          },
        ],
        worldVariables: [
          {
            id: "world_countdown",
            name: "Winter Countdown",
            kind: "countdown",
            value: "3",
          },
        ],
        existingPackage: null,
      },
    });

    assert.match(prompt.system, /Output ONLY valid JSON/);
    assert.match(prompt.user, /Create a tense frontier-defense package/);
    assert.match(prompt.user, /"id": "actor_player"/);
    assert.match(prompt.user, /"id": "world_countdown"/);
  });

  it("parses fenced JSON and returns a validated draft", () => {
    const result = finalizeScenarioPackageDraft(
      `\`\`\`json\n${JSON.stringify(validPackage, null, 2)}\n\`\`\``,
      validationContext
    );

    assert.equal(result.validation.valid, true);
    assert.ok(result.draft);
    assert.deepEqual(result.critique, [
      "Draft passed validation and diagnostics checks and is ready to apply.",
    ]);
    assert.deepEqual(result.diagnostics, []);
  });

  it("keeps parsed drafts and surfaces validation issues when references are wrong", () => {
    const invalidPackage = {
      ...validPackage,
      choicePolicy: {
        minChoices: 3,
        maxChoices: 5,
        preferredEffectIds: ["missing_effect"],
      },
    };

    const result = finalizeScenarioPackageDraft(
      JSON.stringify(invalidPackage),
      validationContext
    );

    assert.equal(result.validation.valid, false);
    assert.ok(result.draft);
    assert.ok(
      result.validation.issues.some((issue) =>
        issue.message.includes('Unknown effect "missing_effect"')
      )
    );
    assert.ok(
      result.critique.some((line) => line.includes("validation error"))
    );
  });

  it("includes diagnostics in finalized draft results when the package is valid but weak", () => {
    const weakPackage = {
      ...validPackage,
      actorCapabilities: [],
      choicePolicy: {
        minChoices: 3,
        maxChoices: 5,
      },
    };

    const result = finalizeScenarioPackageDraft(
      JSON.stringify(weakPackage),
      validationContext
    );

    assert.equal(result.validation.valid, true);
    assert.ok(
      result.diagnostics.some((diagnostic) =>
        diagnostic.code === "choice_policy_has_no_preferred_effects"
      )
    );
    assert.ok(
      result.critique.some((line) => line.includes("package diagnostic"))
    );
  });

  it("returns a parse failure when the model does not emit JSON", () => {
    const result = finalizeScenarioPackageDraft(
      "This is not valid JSON output.",
      validationContext
    );

    assert.equal(result.validation.valid, false);
    assert.equal(result.draft, null);
    assert.equal(result.validation.issues[0]?.path, "scenarioPackage");
    assert.deepEqual(result.diagnostics, []);
  });

  it("summarizes warnings and errors in critique output", () => {
    const critique = buildScenarioPackageDraftCritique(
      [
        {
          severity: "error",
          path: "choicePolicy.preferredEffectIds",
          message: 'Unknown effect "missing_effect"',
        },
        {
          severity: "warning",
          path: "stateExtensions.objects.object_keep.fields.extra",
          message: "Field is not defined by the object type",
        },
      ],
      [
        {
          severity: "warning",
          code: "actor_capabilities_missing",
          path: "actorCapabilities",
          message: "No actor capabilities are defined.",
        },
      ]
    );

    assert.ok(critique.some((line) => line.includes("Fix 1 validation error")));
    assert.ok(critique.some((line) => line.includes("1 warning")));
    assert.ok(critique.some((line) => line.includes("1 package diagnostic")));
  });
});
