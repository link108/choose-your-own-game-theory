import type {
  FieldDefinition,
  FieldKind,
} from "./types";

export interface ObjectTypeFieldDraft {
  id: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  visible: boolean;
  min: string;
  max: string;
  values: string;
  defaultValue: string;
}

export interface ObjectFieldValueDraft {
  fieldId: string;
  value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function scalarToDraftValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "";
}

export function parseObjectTypeFieldDrafts(
  rawFields: unknown
): ObjectTypeFieldDraft[] {
  if (!isRecord(rawFields)) return [];

  return Object.entries(rawFields).map(([fieldId, rawDefinition]) => {
    const definition = isRecord(rawDefinition) ? rawDefinition : {};

    return {
      id: fieldId,
      label: typeof definition.label === "string" ? definition.label : "",
      kind: isFieldKind(definition.kind) ? definition.kind : "string",
      required: Boolean(definition.required),
      visible: definition.visible === false ? false : true,
      min:
        typeof definition.min === "number" ? String(definition.min) : "",
      max:
        typeof definition.max === "number" ? String(definition.max) : "",
      values: Array.isArray(definition.values)
        ? definition.values
            .filter((value): value is string => typeof value === "string")
            .join(", ")
        : "",
      defaultValue: scalarToDraftValue(definition.defaultValue),
    };
  });
}

export function buildObjectTypeFieldsFromDrafts(
  drafts: ObjectTypeFieldDraft[],
  label = "Object type"
): Record<string, FieldDefinition> {
  const fields: Record<string, FieldDefinition> = {};
  const seenIds = new Set<string>();

  drafts.forEach((draft, index) => {
    const fieldId = draft.id.trim();
    if (!fieldId) {
      throw new Error(`${label} field ${index + 1} is missing an ID.`);
    }
    if (seenIds.has(fieldId)) {
      throw new Error(`${label} has duplicate field ID "${fieldId}".`);
    }
    seenIds.add(fieldId);

    const field: FieldDefinition = {
      kind: draft.kind,
      ...(draft.label.trim() ? { label: draft.label.trim() } : {}),
      ...(draft.required ? { required: true } : {}),
      ...(draft.visible ? {} : { visible: false }),
    };

    if (draft.kind === "number") {
      if (draft.min.trim()) {
        field.min = parseFiniteNumber(
          draft.min,
          `${label} field "${fieldId}" min`
        );
      }
      if (draft.max.trim()) {
        field.max = parseFiniteNumber(
          draft.max,
          `${label} field "${fieldId}" max`
        );
      }
    }

    if (draft.kind === "enum") {
      const values = draft.values
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (values.length === 0) {
        throw new Error(`${label} field "${fieldId}" needs at least one enum value.`);
      }
      field.values = values;
    }

    if (draft.defaultValue.trim()) {
      field.defaultValue = parseScalarByKind(
        draft.defaultValue,
        draft.kind,
        `${label} field "${fieldId}" default value`
      );
    }

    fields[fieldId] = field;
  });

  return fields;
}

export function parseObjectFieldValueDrafts(
  rawFields: unknown
): ObjectFieldValueDraft[] {
  if (!isRecord(rawFields)) return [];

  return Object.entries(rawFields).map(([fieldId, value]) => ({
    fieldId,
    value: scalarToDraftValue(value),
  }));
}

export function buildObjectFieldsFromDrafts(
  drafts: ObjectFieldValueDraft[],
  fieldDefinitions: Record<string, FieldDefinition> = {},
  label = "Object"
): Record<string, string | number | boolean> {
  const fields: Record<string, string | number | boolean> = {};
  const seenIds = new Set<string>();

  drafts.forEach((draft, index) => {
    const fieldId = draft.fieldId.trim();
    const rawValue = draft.value.trim();

    if (!fieldId && !rawValue) return;
    if (!fieldId) {
      throw new Error(`${label} field ${index + 1} is missing an ID.`);
    }
    if (seenIds.has(fieldId)) {
      throw new Error(`${label} has duplicate field ID "${fieldId}".`);
    }
    seenIds.add(fieldId);

    if (!rawValue) return;

    const definition = fieldDefinitions[fieldId];
    fields[fieldId] = definition
      ? parseScalarByKind(
          draft.value,
          definition.kind,
          `${label} field "${fieldId}"`
        )
      : parseGenericScalar(
          draft.value,
          `${label} field "${fieldId}"`
        );
  });

  return fields;
}

function parseScalarByKind(
  raw: string,
  kind: FieldKind,
  label: string
): string | number | boolean {
  const trimmed = raw.trim();

  if (kind === "number") {
    return parseFiniteNumber(trimmed, label);
  }

  if (kind === "boolean") {
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    throw new Error(`${label} must be true or false.`);
  }

  return trimmed;
}

function parseGenericScalar(
  raw: string,
  label: string
): string | number | boolean {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed === String(numeric)) {
    return numeric;
  }

  if (!trimmed) {
    throw new Error(`${label} is missing a value.`);
  }

  return trimmed;
}

function parseFiniteNumber(raw: string, label: string): number {
  const value = Number(raw.trim());
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a valid number.`);
  }
  return value;
}

function isFieldKind(value: unknown): value is FieldKind {
  return (
    value === "string" ||
    value === "number" ||
    value === "boolean" ||
    value === "enum"
  );
}
