import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOperationsFromDrafts,
  createEmptyOperationDraft,
  parseOperationDrafts,
} from "@/lib/scenario-dsl/operation-editor";

describe("scenario operation editor helpers", () => {
  it("parses operations into typed drafts", () => {
    const drafts = parseOperationDrafts([
      {
        op: "setWorldVariable",
        variable: "world_season",
        value: "Winter",
      },
      {
        op: "adjustObjectField",
        object: "object_pass",
        field: "defense",
        delta: 10,
      },
    ]);

    assert.equal(drafts.length, 2);
    assert.equal(drafts[0]?.op, "setWorldVariable");
    assert.equal(drafts[0]?.variable, "world_season");
    assert.equal(drafts[1]?.delta, "10");
  });

  it("builds operations from typed drafts", () => {
    const drafts = [
      {
        ...createEmptyOperationDraft(),
        op: "setWorldVariable" as const,
        variable: "world_season",
        value: "Winter",
      },
      {
        ...createEmptyOperationDraft(),
        op: "addEvent" as const,
        eventType: "weather",
        description: "Snow closes the road.",
        involvedActors: "actor_player, actor_rival",
      },
      {
        ...createEmptyOperationDraft(),
        op: "createObject" as const,
        createObjectId: "object_cache",
        createObjectTypeId: "location",
        createObjectName: "Hidden Cache",
        createObjectFieldValueDrafts: [
          { fieldId: "status", value: "hidden" },
          { fieldId: "defense", value: "5" },
        ],
      },
    ];

    assert.deepEqual(
      buildOperationsFromDrafts(drafts, {
        location: {
          status: { kind: "string" },
          defense: { kind: "number" },
        },
      }),
      [
      {
        op: "setWorldVariable",
        variable: "world_season",
        value: "Winter",
      },
      {
        op: "addEvent",
        eventType: "weather",
        description: "Snow closes the road.",
        involvedActors: ["actor_player", "actor_rival"],
      },
      {
        op: "createObject",
        object: {
          id: "object_cache",
          typeId: "location",
          name: "Hidden Cache",
          visibility: "visible",
          fields: {
            status: "hidden",
            defense: 5,
          },
        },
      },
    ]);
  });

  it("rejects invalid operation drafts early", () => {
    assert.throws(
      () =>
        buildOperationsFromDrafts([
          {
            ...createEmptyOperationDraft(),
            op: "adjustWorldVariable",
            variable: "world_countdown",
            delta: "oops",
          },
        ]),
      /must be a valid number/
    );

    assert.throws(
      () =>
        buildOperationsFromDrafts(
          [
            {
              ...createEmptyOperationDraft(),
              op: "createObject",
              createObjectId: "object_cache",
              createObjectTypeId: "location",
              createObjectName: "Hidden Cache",
              createObjectFieldValueDrafts: [
                { fieldId: "defense", value: "oops" },
              ],
            },
          ],
          {
            location: {
              defense: { kind: "number" },
            },
          }
        ),
      /must be a valid number/
    );
  });
});
