import {
  buildObjectFieldsFromDrafts,
  parseObjectFieldValueDrafts,
  type ObjectFieldValueDraft,
} from "./package-editor";
import type {
  FieldDefinition,
  OperationDefinition,
  ScenarioObject,
} from "./types";

export interface OperationDraft {
  op: OperationDefinition["op"];
  actor: string;
  resource: string;
  relationship: string;
  variable: string;
  object: string;
  field: string;
  delta: string;
  value: string;
  eventType: string;
  description: string;
  involvedActors: string;
  createObjectId: string;
  createObjectTypeId: string;
  createObjectName: string;
  createObjectVisibility: "visible" | "hidden" | "revealed";
  createObjectFieldValueDrafts: ObjectFieldValueDraft[];
}

export const OPERATION_TYPE_OPTIONS: OperationDefinition["op"][] = [
  "adjustActorResource",
  "setActorResource",
  "adjustRelationship",
  "setRelationshipType",
  "adjustWorldVariable",
  "setWorldVariable",
  "setObjectField",
  "adjustObjectField",
  "createObject",
  "archiveObject",
  "addEvent",
  "revealObject",
  "hideObject",
];

export function createEmptyOperationDraft(): OperationDraft {
  return {
    op: "setWorldVariable",
    actor: "",
    resource: "",
    relationship: "",
    variable: "",
    object: "",
    field: "",
    delta: "",
    value: "",
    eventType: "",
    description: "",
    involvedActors: "",
    createObjectId: "",
    createObjectTypeId: "",
    createObjectName: "",
    createObjectVisibility: "visible",
    createObjectFieldValueDrafts: [],
  };
}

export function parseOperationDrafts(raw: unknown): OperationDraft[] {
  if (!Array.isArray(raw)) return [];
  const drafts: OperationDraft[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const operation = item as Partial<OperationDefinition>;
    const draft = createEmptyOperationDraft();

    switch (operation.op) {
      case "adjustActorResource":
        drafts.push({
          ...draft,
          op: operation.op,
          actor: operation.actor ?? "",
          resource: operation.resource ?? "",
          delta: String(operation.delta ?? ""),
        });
        break;
      case "setActorResource":
        drafts.push({
          ...draft,
          op: operation.op,
          actor: operation.actor ?? "",
          resource: operation.resource ?? "",
          value: String(operation.value ?? ""),
        });
        break;
      case "adjustRelationship":
        drafts.push({
          ...draft,
          op: operation.op,
          relationship: operation.relationship ?? "",
          delta: String(operation.delta ?? ""),
        });
        break;
      case "setRelationshipType":
        drafts.push({
          ...draft,
          op: operation.op,
          relationship: operation.relationship ?? "",
          value: operation.value ?? "",
        });
        break;
      case "adjustWorldVariable":
        drafts.push({
          ...draft,
          op: operation.op,
          variable: operation.variable ?? "",
          delta: String(operation.delta ?? ""),
        });
        break;
      case "setWorldVariable":
        drafts.push({
          ...draft,
          op: operation.op,
          variable: operation.variable ?? "",
          value: stringifyScalar(operation.value),
        });
        break;
      case "setObjectField":
        drafts.push({
          ...draft,
          op: operation.op,
          object: operation.object ?? "",
          field: operation.field ?? "",
          value: stringifyScalar(operation.value),
        });
        break;
      case "adjustObjectField":
        drafts.push({
          ...draft,
          op: operation.op,
          object: operation.object ?? "",
          field: operation.field ?? "",
          delta: String(operation.delta ?? ""),
        });
        break;
      case "createObject":
        if (!operation.object) break;
        drafts.push({
          ...draft,
          op: operation.op,
          createObjectId: operation.object.id,
          createObjectTypeId: operation.object.typeId,
          createObjectName: operation.object.name,
          createObjectVisibility: operation.object.visibility,
          createObjectFieldValueDrafts: parseObjectFieldValueDrafts(
            operation.object.fields
          ),
        });
        break;
      case "archiveObject":
      case "revealObject":
      case "hideObject":
        drafts.push({
          ...draft,
          op: operation.op,
          object: operation.object ?? "",
        });
        break;
      case "addEvent":
        drafts.push({
          ...draft,
          op: operation.op,
          eventType: operation.eventType ?? "",
          description: operation.description ?? "",
          involvedActors: operation.involvedActors?.join(", ") ?? "",
        });
        break;
      default:
        break;
    }
  }

  return drafts;
}

export function buildOperationsFromDrafts(
  drafts: OperationDraft[],
  objectTypeFieldDefinitions: Record<string, Record<string, FieldDefinition>> = {},
  label = "Operations"
): OperationDefinition[] {
  return drafts.map((draft, index) =>
    buildOperationFromDraft(
      draft,
      objectTypeFieldDefinitions,
      `${label} row ${index + 1}`
    )
  );
}

function buildOperationFromDraft(
  draft: OperationDraft,
  objectTypeFieldDefinitions: Record<string, Record<string, FieldDefinition>>,
  label: string
): OperationDefinition {
  switch (draft.op) {
    case "adjustActorResource":
      return {
        op: draft.op,
        actor: requireString(draft.actor, `${label} actor`),
        resource: requireString(draft.resource, `${label} resource`),
        delta: parseNumber(draft.delta, `${label} delta`),
      };
    case "setActorResource":
      return {
        op: draft.op,
        actor: requireString(draft.actor, `${label} actor`),
        resource: requireString(draft.resource, `${label} resource`),
        value: parseNumber(draft.value, `${label} value`),
      };
    case "adjustRelationship":
      return {
        op: draft.op,
        relationship: requireString(
          draft.relationship,
          `${label} relationship`
        ),
        delta: parseNumber(draft.delta, `${label} delta`),
      };
    case "setRelationshipType":
      return {
        op: draft.op,
        relationship: requireString(
          draft.relationship,
          `${label} relationship`
        ),
        value: requireString(draft.value, `${label} value`),
      };
    case "adjustWorldVariable":
      return {
        op: draft.op,
        variable: requireString(draft.variable, `${label} variable`),
        delta: parseNumber(draft.delta, `${label} delta`),
      };
    case "setWorldVariable":
      return {
        op: draft.op,
        variable: requireString(draft.variable, `${label} variable`),
        value: parseScalar(draft.value, `${label} value`),
      };
    case "setObjectField":
      return {
        op: draft.op,
        object: requireString(draft.object, `${label} object`),
        field: requireString(draft.field, `${label} field`),
        value: parseScalar(draft.value, `${label} value`),
      };
    case "adjustObjectField":
      return {
        op: draft.op,
        object: requireString(draft.object, `${label} object`),
        field: requireString(draft.field, `${label} field`),
        delta: parseNumber(draft.delta, `${label} delta`),
      };
    case "createObject":
      return {
        op: draft.op,
        object: buildCreateObjectFromDraft(
          draft,
          objectTypeFieldDefinitions,
          label
        ),
      };
    case "archiveObject":
    case "revealObject":
    case "hideObject":
      return {
        op: draft.op,
        object: requireString(draft.object, `${label} object`),
      };
    case "addEvent":
      return {
        op: draft.op,
        eventType: requireString(draft.eventType, `${label} event type`),
        description: requireString(
          draft.description,
          `${label} description`
        ),
        ...(draft.involvedActors.trim()
          ? {
              involvedActors: draft.involvedActors
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean),
            }
          : {}),
      };
  }
}

function buildCreateObjectFromDraft(
  draft: OperationDraft,
  objectTypeFieldDefinitions: Record<string, Record<string, FieldDefinition>>,
  label: string
): ScenarioObject {
  const typeId = requireString(
    draft.createObjectTypeId,
    `${label} createObject typeId`
  );
  const fieldDefinitions = objectTypeFieldDefinitions[typeId] ?? {};
  const fields = buildObjectFieldsFromDrafts(
    draft.createObjectFieldValueDrafts,
    fieldDefinitions,
    `${label} createObject`
  );

  return {
    id: requireString(draft.createObjectId, `${label} createObject id`),
    typeId,
    name: requireString(draft.createObjectName, `${label} createObject name`),
    visibility: draft.createObjectVisibility,
    fields,
  };
}

function requireString(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function parseNumber(value: string, label: string): number {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid number.`);
  return parsed;
}

function parseScalar(
  value: string,
  label: string
): string | number | boolean {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed === String(numeric)) return numeric;
  return trimmed;
}

function stringifyScalar(value: string | number | boolean | undefined): string {
  if (value === undefined) return "";
  return String(value);
}
