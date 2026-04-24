import type {
  ScenarioCreationMessageKind,
  ScenarioCreationMessageRole,
  ScenarioCreationOptionGroupStatus,
  ScenarioCreationOptionSelectionMode,
  ScenarioCreationSessionStatus,
} from "@/generated/prisma/enums";
import type { ScenarioCreationWorkingDraft } from "./schema";

type SessionRecord = {
  id: string;
  status: ScenarioCreationSessionStatus;
  title: string | null;
  sourcePrompt: string;
  workingDraft: unknown;
  createdScenarioId: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages: Array<{
    id: string;
    role: ScenarioCreationMessageRole;
    kind: ScenarioCreationMessageKind;
    content: string;
    metadata: unknown;
    createdAt: Date;
  }>;
  optionGroups: Array<{
    id: string;
    stage: string;
    kind: string;
    title: string;
    description: string | null;
    selectionMode: ScenarioCreationOptionSelectionMode;
    status: ScenarioCreationOptionGroupStatus;
    options: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export function serializeScenarioCreationSession(record: SessionRecord) {
  return {
    id: record.id,
    status: record.status,
    title: record.title,
    sourcePrompt: record.sourcePrompt,
    workingDraft: (record.workingDraft as ScenarioCreationWorkingDraft | null) ?? null,
    createdScenarioId: record.createdScenarioId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    messages: record.messages.map((message) => ({
      id: message.id,
      role: message.role,
      kind: message.kind,
      content: message.content,
      metadata:
        message.metadata && typeof message.metadata === "object"
          ? (message.metadata as Record<string, unknown>)
          : null,
      createdAt: message.createdAt.toISOString(),
    })),
    optionGroups: record.optionGroups.map((group) => ({
      id: group.id,
      stage: group.stage,
      kind: group.kind,
      title: group.title,
      description: group.description,
      selectionMode: group.selectionMode,
      status: group.status,
      options: Array.isArray(group.options) ? group.options : [],
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    })),
  };
}
