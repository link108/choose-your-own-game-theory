import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildObjectFieldsFromDrafts,
  buildObjectTypeFieldsFromDrafts,
  parseObjectFieldValueDrafts,
  parseObjectTypeFieldDrafts,
} from "@/lib/scenario-dsl/package-editor";

describe("scenario package editor helpers", () => {
  it("parses object type fields into typed drafts", () => {
    const drafts = parseObjectTypeFieldDrafts({
      defense: {
        kind: "number",
        label: "Defense",
        required: true,
        min: 0,
        max: 100,
        defaultValue: 20,
      },
      status: {
        kind: "enum",
        values: ["open", "blocked"],
        visible: false,
      },
    });

    assert.equal(drafts.length, 2);
    assert.equal(drafts[0]?.id, "defense");
    assert.equal(drafts[0]?.defaultValue, "20");
    assert.equal(drafts[1]?.values, "open, blocked");
    assert.equal(drafts[1]?.visible, false);
  });

  it("builds field definitions from typed drafts", () => {
    const fields = buildObjectTypeFieldsFromDrafts([
      {
        id: "defense",
        label: "Defense",
        kind: "number",
        required: true,
        visible: true,
        min: "0",
        max: "100",
        values: "",
        defaultValue: "20",
      },
      {
        id: "status",
        label: "",
        kind: "enum",
        required: false,
        visible: false,
        min: "",
        max: "",
        values: "open, blocked",
        defaultValue: "open",
      },
    ]);

    assert.deepEqual(fields, {
      defense: {
        kind: "number",
        label: "Defense",
        required: true,
        min: 0,
        max: 100,
        defaultValue: 20,
      },
      status: {
        kind: "enum",
        visible: false,
        values: ["open", "blocked"],
        defaultValue: "open",
      },
    });
  });

  it("parses object field values and rebuilds typed values from definitions", () => {
    const drafts = parseObjectFieldValueDrafts({
      defense: 30,
      alert: true,
      status: "open",
    });

    const fields = buildObjectFieldsFromDrafts(drafts, {
      defense: { kind: "number" },
      alert: { kind: "boolean" },
      status: { kind: "enum", values: ["open", "blocked"] },
    });

    assert.deepEqual(fields, {
      defense: 30,
      alert: true,
      status: "open",
    });
  });

  it("rejects invalid typed values early", () => {
    assert.throws(
      () =>
        buildObjectFieldsFromDrafts(
          [{ fieldId: "defense", value: "not-a-number" }],
          { defense: { kind: "number" } }
        ),
      /must be a valid number/
    );

    assert.throws(
      () =>
        buildObjectTypeFieldsFromDrafts([
          {
            id: "status",
            label: "",
            kind: "enum",
            required: false,
            visible: true,
            min: "",
            max: "",
            values: "",
            defaultValue: "",
          },
        ]),
      /needs at least one enum value/
    );
  });
});
