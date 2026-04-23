import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScenarioBuilderAuthorContext,
  buildScenarioBuilderCritique,
  buildScenarioBuilderDraftResult,
  buildScenarioRequirementsPrompt,
  buildScenarioSectionRegenerationPrompt,
  buildScenarioBuilderShellPrompt,
  createScenarioFromBuilderDraft,
  finalizeScenarioRequirementsAnalysis,
  finalizeScenarioBuilderShellDraft,
  validateScenarioBuilderDraft,
} from "@/lib/scenario-builder";
import type { ScenarioBuilderDraft } from "@/lib/scenario-builder/schema";

const validDraft: ScenarioBuilderDraft = {
  name: "Border Crisis",
  description: "A tense frontier conflict between a republic and a rival empire.",
  worldDescription:
    "Winter is closing in and control of the mountain passes will determine the campaign.",
  actors: [
    {
      id: "actor_player",
      name: "Republic Command",
      description: "A fragile coalition trying to keep the border open.",
      goals: ["Hold the mountain passes", "Avoid full war"],
      traits: ["cautious", "outnumbered"],
      isPlayer: true,
      resources: [
        {
          id: "resource_supplies",
          name: "Supplies",
          value: 8,
          minValue: 0,
          maxValue: 12,
        },
      ],
    },
    {
      id: "actor_empire",
      name: "Imperial Army",
      description: "A larger rival force pressing for concessions.",
      goals: ["Force a retreat"],
      traits: ["disciplined"],
      isPlayer: false,
      resources: [
        {
          id: "resource_pressure",
          name: "Pressure",
          value: 6,
          minValue: 0,
          maxValue: 10,
        },
      ],
    },
  ],
  relationships: [
    {
      id: "rel_player_empire",
      fromActorId: "actor_player",
      toActorId: "actor_empire",
      type: "rival",
      strength: 85,
      description: "Escalating standoff over the passes.",
    },
  ],
  worldVariables: [
    {
      id: "world_winter_countdown",
      name: "Winter Countdown",
      value: "3",
      kind: "countdown",
      minValue: "0",
      maxValue: "3",
      config: { step: 1 },
    },
  ],
  scenarioPackage: {
    version: 1,
    metadata: {
      title: "Border Crisis",
      summary: "A winter border standoff over strategic passes.",
    },
    stateExtensions: {
      objectTypes: [
        {
          id: "location",
          label: "Location",
          fields: {
            controller: { kind: "string", required: true },
            condition: {
              kind: "enum",
              values: ["open", "fortified", "blocked"],
              required: true,
            },
          },
        },
      ],
      objects: [
        {
          id: "object_north_pass",
          typeId: "location",
          name: "North Pass",
          visibility: "visible",
          fields: {
            controller: "actor_player",
            condition: "open",
          },
        },
      ],
    },
    effectDefinitions: [
      {
        id: "fortify_pass",
        label: "Fortify Pass",
        description: "Spend supplies to reinforce a mountain pass.",
        parameters: {
          actor: { type: "actor", required: true },
          pass: { type: "object", objectType: "location", required: true },
        },
        intensities: {
          moderate: [
            {
              op: "adjustActorResource",
              actor: "$actor",
              resource: "resource_supplies",
              delta: -2,
            },
            {
              op: "setObjectField",
              object: "$pass",
              field: "condition",
              value: "fortified",
            },
          ],
        },
      },
    ],
    actorCapabilities: [
      {
        actorId: "actor_player",
        effectIds: ["fortify_pass"],
      },
    ],
    triggerRules: [
      {
        id: "winter_arrives",
        description: "As the countdown expires, weather closes in.",
        once: true,
        when: {
          worldVariable: "world_winter_countdown",
          lte: 0,
        },
        operations: [
          {
            op: "addEvent",
            eventType: "weather",
            description: "Winter storms choke the border roads.",
            involvedActors: ["actor_player", "actor_empire"],
          },
        ],
      },
    ],
    choicePolicy: {
      minChoices: 3,
      maxChoices: 5,
      preferredEffectIds: ["fortify_pass"],
    },
  },
};

describe("scenario builder helpers", () => {
  it("builds a shell prompt around the author concept", () => {
    const prompt = buildScenarioBuilderShellPrompt(
      "A cold-war trade crisis with a fragile player coalition."
    );

    assert.match(prompt.system, /Output ONLY valid JSON/);
    assert.match(prompt.system, /Exactly one actor must have "isPlayer": true/);
    assert.match(prompt.user, /cold-war trade crisis/);
  });

  it("builds author context from prompt answers", () => {
    const context = buildScenarioBuilderAuthorContext("Trade crisis", [
      { id: "player_role", answer: "The player runs a merchant republic." },
      { id: "pressure", answer: "A blockade countdown should matter." },
    ]);

    assert.match(context, /Trade crisis/);
    assert.match(context, /player_role: The player runs a merchant republic/);
    assert.match(context, /pressure: A blockade countdown should matter/);
  });

  it("builds and parses requirements analysis output", () => {
    const prompt = buildScenarioRequirementsPrompt(
      "A coup-era capital where the player is caught between generals."
    );

    assert.match(prompt.system, /Ask at most 4 questions/);
    assert.match(prompt.user, /caught between generals/);

    const analysis = finalizeScenarioRequirementsAnalysis(
      JSON.stringify({
        summary: "Strong political premise, but some simulation details are missing.",
        questions: [
          {
            id: "player_role",
            label: "Player Role",
            question: "Who exactly does the player control?",
            rationale: "This determines actor setup and player resources.",
          },
        ],
      })
    );

    assert.equal(analysis.questions.length, 1);
    assert.equal(analysis.questions[0]?.id, "player_role");
  });

  it("parses fenced scenario shell JSON", () => {
    const shell = {
      name: validDraft.name,
      description: validDraft.description,
      worldDescription: validDraft.worldDescription,
      actors: validDraft.actors,
      relationships: validDraft.relationships,
      worldVariables: validDraft.worldVariables,
    };

    const result = finalizeScenarioBuilderShellDraft(
      `\`\`\`json\n${JSON.stringify(shell, null, 2)}\n\`\`\``
    );

    assert.ok(result.draft);
    assert.deepEqual(result.issues, []);
    assert.equal(result.draft?.actors[0]?.id, "actor_player");
  });

  it("reports shell validation errors for invalid player setup", () => {
    const shell = {
      name: validDraft.name,
      description: validDraft.description,
      worldDescription: validDraft.worldDescription,
      actors: validDraft.actors.map((actor) => ({ ...actor, isPlayer: false })),
      relationships: validDraft.relationships,
      worldVariables: validDraft.worldVariables,
    };

    const result = finalizeScenarioBuilderShellDraft(JSON.stringify(shell));
    assert.ok(
      result.issues.some((issue) =>
        issue.message.includes("Exactly one player actor is required")
      )
    );
  });

  it("validates the full scenario draft including package references", () => {
    const invalidDraft = {
      ...validDraft,
      scenarioPackage: {
        ...(validDraft.scenarioPackage as Record<string, unknown>),
        actorCapabilities: [
          {
            actorId: "missing_actor",
            effectIds: ["fortify_pass"],
          },
        ],
      },
    } as ScenarioBuilderDraft;

    const validation = validateScenarioBuilderDraft(invalidDraft);
    assert.equal(validation.valid, false);
    assert.ok(
      validation.issues.some((issue) =>
        issue.message.includes('Unknown actor "missing_actor"')
      )
    );
  });

  it("builds a section regeneration prompt with current draft context", () => {
    const prompt = buildScenarioSectionRegenerationPrompt({
      draft: validDraft,
      section: "actors",
      authorPrompt: "A frontier crisis.",
      refinementPrompt: "Add a civilian mediator.",
      answers: [{ id: "player_role", answer: "The player leads the republic." }],
    });

    assert.match(prompt.system, /Return ONLY the "actors" section/);
    assert.match(prompt.user, /Add a civilian mediator/);
    assert.match(prompt.user, /"name": "Border Crisis"/);
  });

  it("marks shell quality gaps as warnings in the draft result", () => {
    const weakDraft = {
      ...validDraft,
      relationships: [],
      worldVariables: [],
    };

    const result = buildScenarioBuilderDraftResult(weakDraft);
    assert.equal(result.validation.valid, true);
    assert.ok(
      result.validation.issues.some((issue) => issue.severity === "warning")
    );
  });

  it("summarizes validation issues and diagnostics in critique output", () => {
    const critique = buildScenarioBuilderCritique(
      [
        {
          severity: "error",
          path: "actors",
          message: "Exactly one player actor is required; found 0.",
        },
      ],
      [
        {
          severity: "warning",
          code: "choice_policy_has_no_preferred_effects",
          path: "choicePolicy.preferredEffectIds",
          message: "No preferred effect ids are configured.",
        },
      ]
    );

    assert.ok(critique[0]?.includes("validation error"));
    assert.ok(critique.some((line) => line.includes("package diagnostic")));
  });

  it("persists a valid draft by preserving generated ids", async () => {
    const calls: Array<{ table: string; data: Record<string, unknown> }> = [];

    const fakeDb = {
      $transaction: async (
        callback: (tx: {
          scenario: { create: (input: { data: Record<string, unknown> }) => Promise<{ id: string }> };
          actor: { create: (input: { data: Record<string, unknown> }) => Promise<void> };
          actorRelationship: {
            create: (input: { data: Record<string, unknown> }) => Promise<void>;
          };
          worldVariable: {
            create: (input: { data: Record<string, unknown> }) => Promise<void>;
          };
        }) => Promise<{ id: string }>
      ) =>
        callback({
          scenario: {
            create: async ({ data }) => {
              calls.push({ table: "scenario", data });
              return { id: "scenario_created" };
            },
          },
          actor: {
            create: async ({ data }) => {
              calls.push({ table: "actor", data });
            },
          },
          actorRelationship: {
            create: async ({ data }) => {
              calls.push({ table: "relationship", data });
            },
          },
          worldVariable: {
            create: async ({ data }) => {
              calls.push({ table: "worldVariable", data });
            },
          },
        }),
    };

    const scenario = await createScenarioFromBuilderDraft(
      fakeDb as never,
      validDraft
    );

    assert.equal(scenario.id, "scenario_created");
    assert.equal(calls[0]?.table, "scenario");
    assert.equal(calls[1]?.table, "actor");
    assert.equal(calls[1]?.data.id, "actor_player");
    assert.equal(calls[2]?.data.id, "actor_empire");
    assert.equal(calls[3]?.data.id, "rel_player_empire");
    assert.equal(calls[4]?.data.id, "world_winter_countdown");
  });
});
