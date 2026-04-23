import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEffectDefinitionsFromDrafts,
  createEmptyEffectDefinitionDraft,
  createEmptyEffectParameterDraft,
} from "@/lib/scenario-dsl/effect-editor";
import { createEmptyOperationDraft } from "@/lib/scenario-dsl/operation-editor";

describe("scenario effect editor helpers", () => {
  it("builds effect definitions from typed drafts", () => {
    const drafts = [
      {
        ...createEmptyEffectDefinitionDraft(),
        id: "fortify_location",
        label: "Fortify Location",
        description: "Spend resources to improve a location.",
        parameterDrafts: [
          {
            ...createEmptyEffectParameterDraft(),
            name: "actor",
            type: "actor" as const,
          },
          {
            ...createEmptyEffectParameterDraft(),
            name: "location",
            type: "object" as const,
            objectType: "location",
          },
        ],
        intensityDrafts: {
          minor: [],
          moderate: [
            {
              ...createEmptyOperationDraft(),
              op: "adjustObjectField" as const,
              object: "$location",
              field: "defense",
              delta: "10",
            },
            {
              ...createEmptyOperationDraft(),
              op: "addEvent" as const,
              eventType: "fortification",
              description: "$actor fortifies $location",
              involvedActors: "$actor",
            },
          ],
          major: [],
        },
      },
    ];

    assert.deepEqual(buildEffectDefinitionsFromDrafts(drafts), [
      {
        id: "fortify_location",
        label: "Fortify Location",
        description: "Spend resources to improve a location.",
        parameters: {
          actor: { type: "actor" },
          location: { type: "object", objectType: "location" },
        },
        intensities: {
          moderate: [
            {
              op: "adjustObjectField",
              object: "$location",
              field: "defense",
              delta: 10,
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
    ]);
  });

  it("rejects drafts with no defined intensities", () => {
    assert.throws(
      () =>
        buildEffectDefinitionsFromDrafts([
          {
            ...createEmptyEffectDefinitionDraft(),
            id: "broken",
            label: "Broken",
            description: "Missing operations",
          },
        ]),
      /must define at least one intensity/
    );
  });

  it("preserves optional parameters as non-required", () => {
    const effect = buildEffectDefinitionsFromDrafts([
      {
        ...createEmptyEffectDefinitionDraft(),
        id: "probe",
        label: "Probe",
        description: "Test optional bindings.",
        parameterDrafts: [
          {
            ...createEmptyEffectParameterDraft(),
            name: "target",
            type: "object",
            objectType: "location",
            required: false,
          },
        ],
        intensityDrafts: {
          minor: [
            {
              ...createEmptyOperationDraft(),
              op: "addEvent",
              eventType: "probe",
              description: "A cautious probe occurs.",
            },
          ],
          moderate: [],
          major: [],
        },
      },
    ])[0];

    assert.deepEqual(effect?.parameters, {
      target: {
        type: "object",
        objectType: "location",
        required: false,
      },
    });
  });
});
