"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  buildEffectDefinitionsFromDrafts,
  createEmptyEffectDefinitionDraft,
  createEmptyEffectParameterDraft,
  EFFECT_INTENSITY_OPTIONS,
  EFFECT_PARAMETER_TYPE_OPTIONS,
  parseEffectDefinitionDrafts,
  type EffectDefinitionDraft,
  type EffectParameterDraft,
} from "@/lib/scenario-dsl/effect-editor";
import {
  buildObjectFieldsFromDrafts,
  buildObjectTypeFieldsFromDrafts,
  parseObjectFieldValueDrafts,
  parseObjectTypeFieldDrafts,
  type ObjectFieldValueDraft,
  type ObjectTypeFieldDraft,
} from "@/lib/scenario-dsl/package-editor";
import type { EffectIntensity, FieldDefinition } from "@/lib/scenario-dsl";
import {
  buildOperationsFromDrafts,
  createEmptyOperationDraft,
  OPERATION_TYPE_OPTIONS,
  parseOperationDrafts,
  type OperationDraft,
} from "@/lib/scenario-dsl/operation-editor";
import type { ActorData, WorldVariableData } from "./types";

interface ScenarioPackagePanelProps {
  scenarioId: string;
  scenarioPackage: unknown | null;
  actors: ActorData[];
  worldVariables: WorldVariableData[];
  onScenarioPackageSaved?: () => void;
}

interface ValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

interface DiagnosticIssue {
  severity: "warning";
  code: string;
  path: string;
  message: string;
  recommendation?: string;
}

interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  diagnostics: DiagnosticIssue[];
}

interface DraftGenerationResult {
  draft: unknown | null;
  validation: ValidationResult;
  diagnostics: DiagnosticIssue[];
  critique: string[];
}

interface TriggerRuleDraft {
  id: string;
  description: string;
  once: boolean;
  worldVariable: string;
  object: string;
  field: string;
  equals: string;
  lte: string;
  gte: string;
  operationDrafts: OperationDraft[];
}

interface ObjectTypeDraft {
  id: string;
  label: string;
  description: string;
  fieldDrafts: ObjectTypeFieldDraft[];
}

interface ObjectDraft {
  id: string;
  typeId: string;
  name: string;
  visibility: "visible" | "hidden" | "revealed";
  fieldValueDrafts: ObjectFieldValueDraft[];
}

const FIELD_KIND_OPTIONS = ["string", "number", "boolean", "enum"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function ScenarioPackagePanel({
  scenarioId,
  scenarioPackage,
  actors,
  worldVariables,
  onScenarioPackageSaved,
}: ScenarioPackagePanelProps) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [draftResult, setDraftResult] = useState<DraftGenerationResult | null>(null);
  const [applyingDraft, setApplyingDraft] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [minChoices, setMinChoices] = useState("3");
  const [maxChoices, setMaxChoices] = useState("5");
  const [guidance, setGuidance] = useState("");
  const [preferredEffectIds, setPreferredEffectIds] = useState("");
  const [effectDefinitionDrafts, setEffectDefinitionDrafts] = useState<
    EffectDefinitionDraft[]
  >([]);
  const [savingEffects, setSavingEffects] = useState(false);
  const [effectError, setEffectError] = useState("");
  const [capabilityValues, setCapabilityValues] = useState<Record<string, string>>(
    {}
  );
  const [savingCapabilities, setSavingCapabilities] = useState(false);
  const [capabilityError, setCapabilityError] = useState("");
  const [triggerRuleDrafts, setTriggerRuleDrafts] = useState<TriggerRuleDraft[]>([]);
  const [savingTriggerRules, setSavingTriggerRules] = useState(false);
  const [triggerRuleError, setTriggerRuleError] = useState("");
  const [objectTypeDrafts, setObjectTypeDrafts] = useState<ObjectTypeDraft[]>([]);
  const [savingObjectTypes, setSavingObjectTypes] = useState(false);
  const [objectTypeError, setObjectTypeError] = useState("");
  const [objectDrafts, setObjectDrafts] = useState<ObjectDraft[]>([]);
  const [savingObjects, setSavingObjects] = useState(false);
  const [objectError, setObjectError] = useState("");

  const packageSummary = useMemo(() => {
    if (!isRecord(scenarioPackage)) return null;

    const stateExtensions = isRecord(scenarioPackage.stateExtensions)
      ? scenarioPackage.stateExtensions
      : null;

    const effectDefinitions = Array.isArray(scenarioPackage.effectDefinitions)
      ? scenarioPackage.effectDefinitions
      : [];
    const actorCapabilities = Array.isArray(scenarioPackage.actorCapabilities)
      ? scenarioPackage.actorCapabilities
      : [];
    const triggerRules = Array.isArray(scenarioPackage.triggerRules)
      ? scenarioPackage.triggerRules
      : [];
    const objectTypes =
      stateExtensions && Array.isArray(stateExtensions.objectTypes)
        ? stateExtensions.objectTypes
        : [];
    const objects =
      stateExtensions && Array.isArray(stateExtensions.objects)
        ? stateExtensions.objects
        : [];

    return {
      version:
        typeof scenarioPackage.version === "number"
          ? String(scenarioPackage.version)
          : "unknown",
      objectTypeCount: objectTypes.length,
      objectCount: objects.length,
      effectCount: effectDefinitions.length,
      capabilityCount: actorCapabilities.length,
      triggerCount: triggerRules.length,
    };
  }, [scenarioPackage]);

  const relationshipOptions = useMemo(
    () =>
      actors.flatMap((actor) =>
        actor.relationshipsFrom.map((relationship) => ({
          id: relationship.id,
          label: relationship.toActor?.name
            ? `${relationship.id} (${actor.name} -> ${relationship.toActor.name})`
            : relationship.id,
        }))
      ),
    [actors]
  );

  const resourceOptions = useMemo(
    () =>
      actors.flatMap((actor) =>
        actor.resources.map((resource) => ({
          id: resource.id,
          label: `${resource.id} (${actor.name} / ${resource.name})`,
        }))
      ),
    [actors]
  );

  const actorOptions = useMemo(
    () => actors.map((actor) => ({ id: actor.id, label: `${actor.id} (${actor.name})` })),
    [actors]
  );

  const worldVariableOptions = useMemo(
    () =>
      worldVariables.map((variable) => ({
        id: variable.id,
        label: `${variable.id} (${variable.name})`,
      })),
    [worldVariables]
  );

  const objectOptions = useMemo(
    () =>
      objectDrafts.map((objectDraft) => ({
        id: objectDraft.id,
        label: objectDraft.name.trim()
          ? `${objectDraft.id} (${objectDraft.name})`
          : objectDraft.id,
      })),
    [objectDrafts]
  );

  useEffect(() => {
    if (!isRecord(scenarioPackage) || !isRecord(scenarioPackage.choicePolicy)) {
      setMinChoices("3");
      setMaxChoices("5");
      setGuidance("");
      setPreferredEffectIds("");
      return;
    }

    const choicePolicy = scenarioPackage.choicePolicy;
    setMinChoices(
      typeof choicePolicy.minChoices === "number"
        ? String(choicePolicy.minChoices)
        : "3"
    );
    setMaxChoices(
      typeof choicePolicy.maxChoices === "number"
        ? String(choicePolicy.maxChoices)
        : "5"
    );
    setGuidance(
      typeof choicePolicy.guidance === "string" ? choicePolicy.guidance : ""
    );
    setPreferredEffectIds(
      Array.isArray(choicePolicy.preferredEffectIds)
        ? choicePolicy.preferredEffectIds.join(", ")
        : ""
    );
  }, [scenarioPackage]);

  useEffect(() => {
    const drafts =
      isRecord(scenarioPackage) && Array.isArray(scenarioPackage.effectDefinitions)
        ? parseEffectDefinitionDrafts(scenarioPackage.effectDefinitions)
        : [];

    setEffectDefinitionDrafts(drafts);
  }, [scenarioPackage]);

  useEffect(() => {
    const stateExtensions =
      isRecord(scenarioPackage) && isRecord(scenarioPackage.stateExtensions)
        ? scenarioPackage.stateExtensions
        : null;

    const drafts =
      stateExtensions && Array.isArray(stateExtensions.objectTypes)
        ? stateExtensions.objectTypes
            .filter((item: unknown): item is Record<string, unknown> => isRecord(item))
            .map((item) => ({
              id: typeof item.id === "string" ? item.id : "",
              label: typeof item.label === "string" ? item.label : "",
              description:
                typeof item.description === "string" ? item.description : "",
              fieldDrafts: parseObjectTypeFieldDrafts(item.fields),
            }))
        : [];

    setObjectTypeDrafts(drafts);
  }, [scenarioPackage]);

  useEffect(() => {
    const stateExtensions =
      isRecord(scenarioPackage) && isRecord(scenarioPackage.stateExtensions)
        ? scenarioPackage.stateExtensions
        : null;

    const drafts =
      stateExtensions && Array.isArray(stateExtensions.objects)
        ? stateExtensions.objects
            .filter((item: unknown): item is Record<string, unknown> => isRecord(item))
            .map((item) => ({
              id: typeof item.id === "string" ? item.id : "",
              typeId: typeof item.typeId === "string" ? item.typeId : "",
              name: typeof item.name === "string" ? item.name : "",
              visibility: (
                item.visibility === "hidden" ||
                item.visibility === "revealed" ||
                item.visibility === "visible"
                  ? item.visibility
                  : "visible"
              ) as "visible" | "hidden" | "revealed",
              fieldValueDrafts: parseObjectFieldValueDrafts(item.fields),
            }))
        : [];

    setObjectDrafts(drafts);
  }, [scenarioPackage]);

  useEffect(() => {
    const nextValues = Object.fromEntries(
      actors.map((actor) => {
        const capability = isRecord(scenarioPackage) &&
          Array.isArray(scenarioPackage.actorCapabilities)
          ? scenarioPackage.actorCapabilities.find(
              (item: unknown) => isRecord(item) && item.actorId === actor.id
            )
          : null;

        const effectIds =
          capability && Array.isArray(capability.effectIds)
            ? capability.effectIds.filter(
                (item: unknown): item is string => typeof item === "string"
              )
            : [];

        return [actor.id, effectIds.join(", ")];
      })
    );

    setCapabilityValues(nextValues);
  }, [actors, scenarioPackage]);

  useEffect(() => {
    const drafts =
      isRecord(scenarioPackage) && Array.isArray(scenarioPackage.triggerRules)
        ? scenarioPackage.triggerRules
            .filter((rule: unknown): rule is Record<string, unknown> => isRecord(rule))
            .map((rule) => {
              const when = isRecord(rule.when) ? rule.when : {};
              return {
                id: typeof rule.id === "string" ? rule.id : "",
                description:
                  typeof rule.description === "string" ? rule.description : "",
                once: Boolean(rule.once),
                worldVariable:
                  typeof when.worldVariable === "string" ? when.worldVariable : "",
                object: typeof when.object === "string" ? when.object : "",
                field: typeof when.field === "string" ? when.field : "",
                equals:
                  when.equals !== undefined && when.equals !== null
                    ? String(when.equals)
                    : "",
                lte:
                  typeof when.lte === "number" || typeof when.lte === "string"
                    ? String(when.lte)
                    : "",
                gte:
                  typeof when.gte === "number" || typeof when.gte === "string"
                    ? String(when.gte)
                    : "",
                operationDrafts: parseOperationDrafts(rule.operations),
              };
            })
        : [];

    setTriggerRuleDrafts(drafts);
  }, [scenarioPackage]);

  const validatePackage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/scenarios/${scenarioId}/package/validate`);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to validate scenario package");
      }
      const data = (await response.json()) as ValidationResult;
      setValidation(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to validate scenario package"
      );
    } finally {
      setLoading(false);
    }
  }, [scenarioId]);

  useEffect(() => {
    void validatePackage();
  }, [validatePackage]);

  async function saveScenarioPackage(nextPackage: Record<string, unknown>) {
    const response = await fetch(`/api/scenarios/${scenarioId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioPackage: nextPackage }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || "Failed to save scenario package");
    }

    await validatePackage();
    onScenarioPackageSaved?.();
  }

  async function generateDraft() {
    const prompt = draftPrompt.trim();
    if (!prompt) {
      setDraftError("Enter a prompt before generating a draft.");
      return;
    }

    setGeneratingDraft(true);
    setDraftError("");

    try {
      const response = await fetch(`/api/scenarios/${scenarioId}/package/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = (await response.json().catch(() => null)) as
        | DraftGenerationResult
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data && "error" in data ? data.error : "Failed to generate draft");
      }

      setDraftResult((data as DraftGenerationResult) ?? null);
    } catch (err) {
      setDraftError(
        err instanceof Error ? err.message : "Failed to generate draft"
      );
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function applyDraft() {
    if (
      !draftResult?.draft ||
      !isRecord(draftResult.draft) ||
      !draftResult.validation.valid
    ) {
      return;
    }

    setApplyingDraft(true);
    setDraftError("");

    try {
      await saveScenarioPackage(draftResult.draft);
      setDraftResult(null);
    } catch (err) {
      setDraftError(
        err instanceof Error ? err.message : "Failed to apply generated draft"
      );
    } finally {
      setApplyingDraft(false);
    }
  }

  async function saveChoicePolicy() {
    if (!isRecord(scenarioPackage)) return;

    setSavingPolicy(true);
    setPolicyError("");

    const parsedMin = Number.parseInt(minChoices, 10);
    const parsedMax = Number.parseInt(maxChoices, 10);
    if (
      !Number.isInteger(parsedMin) ||
      !Number.isInteger(parsedMax) ||
      parsedMin < 1 ||
      parsedMax < 1
    ) {
      setPolicyError("Choice counts must be integers greater than zero.");
      setSavingPolicy(false);
      return;
    }

    const nextPackage = {
      ...scenarioPackage,
      choicePolicy: {
        ...(isRecord(scenarioPackage.choicePolicy) ? scenarioPackage.choicePolicy : {}),
        minChoices: parsedMin,
        maxChoices: parsedMax,
        ...(guidance.trim() ? { guidance: guidance.trim() } : {}),
        ...(!guidance.trim() ? { guidance: undefined } : {}),
        preferredEffectIds: preferredEffectIds
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
    };

    try {
      await saveScenarioPackage(nextPackage);
    } catch (err) {
      setPolicyError(
        err instanceof Error ? err.message : "Failed to save choice policy"
      );
    } finally {
      setSavingPolicy(false);
    }
  }

  function updateEffectDefinitionDraft(
    index: number,
    field: keyof EffectDefinitionDraft,
    value: string | EffectParameterDraft[] | Record<EffectIntensity, OperationDraft[]>
  ) {
    setEffectDefinitionDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, [field]: value } : draft
      )
    );
  }

  function addEffectDefinitionDraft() {
    setEffectDefinitionDrafts((current) => [
      ...current,
      createEmptyEffectDefinitionDraft(),
    ]);
  }

  function removeEffectDefinitionDraft(index: number) {
    setEffectDefinitionDrafts((current) =>
      current.filter((_, draftIndex) => draftIndex !== index)
    );
  }

  function updateEffectParameterDraft(
    effectIndex: number,
    parameterIndex: number,
    field: keyof EffectParameterDraft,
    value: string | boolean
  ) {
    setEffectDefinitionDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex !== effectIndex
          ? draft
          : {
              ...draft,
              parameterDrafts: draft.parameterDrafts.map(
                (parameterDraft, currentParameterIndex) =>
                  currentParameterIndex === parameterIndex
                    ? { ...parameterDraft, [field]: value }
                    : parameterDraft
              ),
            }
      )
    );
  }

  function addEffectParameterDraft(effectIndex: number) {
    setEffectDefinitionDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex !== effectIndex
          ? draft
          : {
              ...draft,
              parameterDrafts: [
                ...draft.parameterDrafts,
                createEmptyEffectParameterDraft(),
              ],
            }
      )
    );
  }

  function removeEffectParameterDraft(effectIndex: number, parameterIndex: number) {
    setEffectDefinitionDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex !== effectIndex
          ? draft
          : {
              ...draft,
              parameterDrafts: draft.parameterDrafts.filter(
                (_, currentParameterIndex) =>
                  currentParameterIndex !== parameterIndex
              ),
            }
      )
    );
  }

  function updateEffectOperationDraft(
    effectIndex: number,
    intensity: EffectIntensity,
    operationIndex: number,
    field: keyof OperationDraft,
    value: string | ObjectFieldValueDraft[]
  ) {
    setEffectDefinitionDrafts((current) =>
      current.map((draft, draftIndex) => {
        if (draftIndex !== effectIndex) return draft;

        return {
          ...draft,
          intensityDrafts: {
            ...draft.intensityDrafts,
            [intensity]: draft.intensityDrafts[intensity].map(
              (operationDraft, currentOperationIndex) =>
                currentOperationIndex === operationIndex
                  ? { ...operationDraft, [field]: value }
                  : operationDraft
            ),
          },
        };
      })
    );
  }

  function updateEffectCreateObjectVisibility(
    effectIndex: number,
    intensity: EffectIntensity,
    operationIndex: number,
    value: "visible" | "hidden" | "revealed"
  ) {
    setEffectDefinitionDrafts((current) =>
      current.map((draft, draftIndex) => {
        if (draftIndex !== effectIndex) return draft;

        return {
          ...draft,
          intensityDrafts: {
            ...draft.intensityDrafts,
            [intensity]: draft.intensityDrafts[intensity].map(
              (operationDraft, currentOperationIndex) =>
                currentOperationIndex === operationIndex
                  ? { ...operationDraft, createObjectVisibility: value }
                  : operationDraft
            ),
          },
        };
      })
    );
  }

  function addEffectOperationDraft(effectIndex: number, intensity: EffectIntensity) {
    setEffectDefinitionDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex !== effectIndex
          ? draft
          : {
              ...draft,
              intensityDrafts: {
                ...draft.intensityDrafts,
                [intensity]: [
                  ...draft.intensityDrafts[intensity],
                  createEmptyOperationDraft(),
                ],
              },
            }
      )
    );
  }

  function removeEffectOperationDraft(
    effectIndex: number,
    intensity: EffectIntensity,
    operationIndex: number
  ) {
    setEffectDefinitionDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex !== effectIndex
          ? draft
          : {
              ...draft,
              intensityDrafts: {
                ...draft.intensityDrafts,
                [intensity]: draft.intensityDrafts[intensity].filter(
                  (_, currentOperationIndex) =>
                    currentOperationIndex !== operationIndex
                ),
              },
            }
      )
    );
  }

  async function saveEffectDefinitions() {
    if (!isRecord(scenarioPackage)) return;

    setSavingEffects(true);
    setEffectError("");

    try {
      const nextPackage = {
        ...scenarioPackage,
        effectDefinitions: buildEffectDefinitionsFromDrafts(
          effectDefinitionDrafts,
          objectTypeFieldDefinitions
        ),
      };

      await saveScenarioPackage(nextPackage);
    } catch (err) {
      setEffectError(
        err instanceof Error ? err.message : "Failed to save effect definitions"
      );
    } finally {
      setSavingEffects(false);
    }
  }

  async function saveActorCapabilities() {
    if (!isRecord(scenarioPackage)) return;

    setSavingCapabilities(true);
    setCapabilityError("");

    const nextPackage = {
      ...scenarioPackage,
      actorCapabilities: actors.map((actor) => ({
        actorId: actor.id,
        effectIds: (capabilityValues[actor.id] ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      })),
    };

    try {
      await saveScenarioPackage(nextPackage);
    } catch (err) {
      setCapabilityError(
        err instanceof Error ? err.message : "Failed to save actor capabilities"
      );
    } finally {
      setSavingCapabilities(false);
    }
  }

  function updateTriggerRuleDraft(
    index: number,
    field: keyof TriggerRuleDraft,
    value: string | boolean
  ) {
    setTriggerRuleDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, [field]: value } : draft
      )
    );
  }

  function addTriggerRuleDraft() {
    setTriggerRuleDrafts((current) => [
      ...current,
      {
        id: "",
        description: "",
        once: false,
        worldVariable: "",
        object: "",
        field: "",
        equals: "",
        lte: "",
        gte: "",
        operationDrafts: [],
      },
    ]);
  }

  function removeTriggerRuleDraft(index: number) {
    setTriggerRuleDrafts((current) =>
      current.filter((_, draftIndex) => draftIndex !== index)
    );
  }

  function updateTriggerOperationDraft(
    triggerIndex: number,
    operationIndex: number,
    field: keyof OperationDraft,
    value: string | ObjectFieldValueDraft[]
  ) {
    setTriggerRuleDrafts((current) =>
      current.map((draft, currentTriggerIndex) =>
        currentTriggerIndex !== triggerIndex
          ? draft
          : {
              ...draft,
              operationDrafts: draft.operationDrafts.map(
                (operationDraft, currentOperationIndex) =>
                  currentOperationIndex === operationIndex
                    ? { ...operationDraft, [field]: value }
                    : operationDraft
              ),
            }
      )
    );
  }

  function updateTriggerCreateObjectVisibility(
    triggerIndex: number,
    operationIndex: number,
    value: "visible" | "hidden" | "revealed"
  ) {
    setTriggerRuleDrafts((current) =>
      current.map((draft, currentTriggerIndex) =>
        currentTriggerIndex !== triggerIndex
          ? draft
          : {
              ...draft,
              operationDrafts: draft.operationDrafts.map(
                (operationDraft, currentOperationIndex) =>
                  currentOperationIndex === operationIndex
                    ? { ...operationDraft, createObjectVisibility: value }
                    : operationDraft
              ),
            }
      )
    );
  }

  function addTriggerOperationDraft(triggerIndex: number) {
    setTriggerRuleDrafts((current) =>
      current.map((draft, currentTriggerIndex) =>
        currentTriggerIndex !== triggerIndex
          ? draft
          : {
              ...draft,
              operationDrafts: [
                ...draft.operationDrafts,
                createEmptyOperationDraft(),
              ],
            }
      )
    );
  }

  function removeTriggerOperationDraft(
    triggerIndex: number,
    operationIndex: number
  ) {
    setTriggerRuleDrafts((current) =>
      current.map((draft, currentTriggerIndex) =>
        currentTriggerIndex !== triggerIndex
          ? draft
          : {
              ...draft,
              operationDrafts: draft.operationDrafts.filter(
                (_, currentOperationIndex) =>
                  currentOperationIndex !== operationIndex
              ),
            }
      )
    );
  }

  function parseScalarInput(value: string): string | number | boolean | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && trimmed === String(numeric)) return numeric;
    return trimmed;
  }

  async function saveTriggerRules() {
    if (!isRecord(scenarioPackage)) return;

    setSavingTriggerRules(true);
    setTriggerRuleError("");

    try {
      const nextTriggerRules = triggerRuleDrafts.map((draft, index) => {
        return {
          id: draft.id.trim(),
          ...(draft.description.trim()
            ? { description: draft.description.trim() }
            : {}),
          ...(draft.once ? { once: true } : {}),
          when: {
            ...(draft.worldVariable.trim()
              ? { worldVariable: draft.worldVariable.trim() }
              : {}),
            ...(draft.object.trim() ? { object: draft.object.trim() } : {}),
            ...(draft.field.trim() ? { field: draft.field.trim() } : {}),
            ...(parseScalarInput(draft.equals) !== undefined
              ? { equals: parseScalarInput(draft.equals) }
              : {}),
            ...(draft.lte.trim() ? { lte: Number(draft.lte.trim()) } : {}),
            ...(draft.gte.trim() ? { gte: Number(draft.gte.trim()) } : {}),
          },
          operations: buildOperationsFromDrafts(
            draft.operationDrafts,
            objectTypeFieldDefinitions,
            `Trigger rule ${index + 1} operations`
          ),
        };
      });

      const nextPackage = {
        ...scenarioPackage,
        triggerRules: nextTriggerRules,
      };

      await saveScenarioPackage(nextPackage);
    } catch (err) {
      setTriggerRuleError(
        err instanceof Error ? err.message : "Failed to save trigger rules"
      );
    } finally {
      setSavingTriggerRules(false);
    }
  }

  function updateObjectTypeDraft(
    index: number,
    field: keyof ObjectTypeDraft,
    value: string | ObjectTypeFieldDraft[]
  ) {
    setObjectTypeDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, [field]: value } : draft
      )
    );
  }

  function addObjectTypeDraft() {
    setObjectTypeDrafts((current) => [
      ...current,
      {
        id: "",
        label: "",
        description: "",
        fieldDrafts: [],
      },
    ]);
  }

  function removeObjectTypeDraft(index: number) {
    setObjectTypeDrafts((current) =>
      current.filter((_, draftIndex) => draftIndex !== index)
    );
  }

  async function saveObjectTypes() {
    if (!isRecord(scenarioPackage)) return;

    setSavingObjectTypes(true);
    setObjectTypeError("");

    try {
      const nextObjectTypes = objectTypeDrafts.map((draft, index) => {
        return {
          id: draft.id.trim(),
          label: draft.label.trim(),
          ...(draft.description.trim()
            ? { description: draft.description.trim() }
            : {}),
          fields: buildObjectTypeFieldsFromDrafts(
            draft.fieldDrafts,
            `Object type ${index + 1}`
          ),
        };
      });

      const currentStateExtensions =
        isRecord(scenarioPackage.stateExtensions) ? scenarioPackage.stateExtensions : {};

      const nextPackage = {
        ...scenarioPackage,
        stateExtensions: {
          ...currentStateExtensions,
          objectTypes: nextObjectTypes,
          objects:
            Array.isArray(currentStateExtensions.objects)
              ? currentStateExtensions.objects
              : [],
        },
      };

      await saveScenarioPackage(nextPackage);
    } catch (err) {
      setObjectTypeError(
        err instanceof Error ? err.message : "Failed to save object types"
      );
    } finally {
      setSavingObjectTypes(false);
    }
  }

  function updateObjectDraft(
    index: number,
    field: keyof ObjectDraft,
    value: string | ObjectFieldValueDraft[]
  ) {
    setObjectDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, [field]: value } : draft
      )
    );
  }

  function updateObjectVisibility(
    index: number,
    value: "visible" | "hidden" | "revealed"
  ) {
    setObjectDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, visibility: value } : draft
      )
    );
  }

  function addObjectDraft() {
    setObjectDrafts((current) => [
      ...current,
      {
        id: "",
        typeId: "",
        name: "",
        visibility: "visible",
        fieldValueDrafts: [],
      },
    ]);
  }

  function removeObjectDraft(index: number) {
    setObjectDrafts((current) =>
      current.filter((_, draftIndex) => draftIndex !== index)
    );
  }

  async function saveObjects() {
    if (!isRecord(scenarioPackage)) return;

    setSavingObjects(true);
    setObjectError("");

    try {
      const nextObjects = objectDrafts.map((draft, index) => {
        const objectTypeDraft = objectTypeDrafts.find(
          (objectType) => objectType.id.trim() === draft.typeId.trim()
        );

        return {
          id: draft.id.trim(),
          typeId: draft.typeId.trim(),
          name: draft.name.trim(),
          visibility: draft.visibility,
          fields: buildObjectFieldsFromDrafts(
            draft.fieldValueDrafts,
            objectTypeDraft
              ? buildObjectTypeFieldsFromDrafts(
                  objectTypeDraft.fieldDrafts,
                  `Object type "${objectTypeDraft.id.trim() || objectTypeDraft.label.trim() || "unknown"}"`
                )
              : {},
            `Object ${index + 1}`
          ),
        };
      });

      const currentStateExtensions =
        isRecord(scenarioPackage.stateExtensions) ? scenarioPackage.stateExtensions : {};

      const nextPackage = {
        ...scenarioPackage,
        stateExtensions: {
          ...currentStateExtensions,
          objectTypes:
            Array.isArray(currentStateExtensions.objectTypes)
              ? currentStateExtensions.objectTypes
              : [],
          objects: nextObjects,
        },
      };

      await saveScenarioPackage(nextPackage);
    } catch (err) {
      setObjectError(
        err instanceof Error ? err.message : "Failed to save objects"
      );
    } finally {
      setSavingObjects(false);
    }
  }

  function updateObjectTypeFieldDraft(
    objectTypeIndex: number,
    fieldIndex: number,
    field: keyof ObjectTypeFieldDraft,
    value: string | boolean
  ) {
    setObjectTypeDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex !== objectTypeIndex
          ? draft
          : {
              ...draft,
              fieldDrafts: draft.fieldDrafts.map((fieldDraft, currentFieldIndex) =>
                currentFieldIndex === fieldIndex
                  ? { ...fieldDraft, [field]: value }
                  : fieldDraft
              ),
            }
      )
    );
  }

  function addObjectTypeFieldDraft(objectTypeIndex: number) {
    setObjectTypeDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex !== objectTypeIndex
          ? draft
          : {
              ...draft,
              fieldDrafts: [
                ...draft.fieldDrafts,
                {
                  id: "",
                  label: "",
                  kind: "string",
                  required: false,
                  visible: true,
                  min: "",
                  max: "",
                  values: "",
                  defaultValue: "",
                },
              ],
            }
      )
    );
  }

  function removeObjectTypeFieldDraft(objectTypeIndex: number, fieldIndex: number) {
    setObjectTypeDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex !== objectTypeIndex
          ? draft
          : {
              ...draft,
              fieldDrafts: draft.fieldDrafts.filter(
                (_, currentFieldIndex) => currentFieldIndex !== fieldIndex
              ),
            }
      )
    );
  }

  function updateObjectFieldValueDraft(
    objectIndex: number,
    fieldIndex: number,
    field: keyof ObjectFieldValueDraft,
    value: string
  ) {
    setObjectDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex !== objectIndex
          ? draft
          : {
              ...draft,
              fieldValueDrafts: draft.fieldValueDrafts.map(
                (fieldDraft, currentFieldIndex) =>
                  currentFieldIndex === fieldIndex
                    ? { ...fieldDraft, [field]: value }
                    : fieldDraft
              ),
            }
      )
    );
  }

  function upsertObjectFieldValueDraft(
    objectIndex: number,
    fieldId: string,
    value: string
  ) {
    setObjectDrafts((current) =>
      current.map((draft, draftIndex) => {
        if (draftIndex !== objectIndex) return draft;

        const normalizedFieldId = fieldId.trim();
        const existingIndex = draft.fieldValueDrafts.findIndex(
          (fieldDraft) => fieldDraft.fieldId === normalizedFieldId
        );

        if (existingIndex === -1) {
          return {
            ...draft,
            fieldValueDrafts: [
              ...draft.fieldValueDrafts,
              { fieldId: normalizedFieldId, value },
            ],
          };
        }

        return {
          ...draft,
          fieldValueDrafts: draft.fieldValueDrafts.map((fieldDraft, index) =>
            index === existingIndex ? { ...fieldDraft, value } : fieldDraft
          ),
        };
      })
    );
  }

  function addObjectFieldValueDraft(objectIndex: number) {
    setObjectDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex !== objectIndex
          ? draft
          : {
              ...draft,
              fieldValueDrafts: [
                ...draft.fieldValueDrafts,
                { fieldId: "", value: "" },
              ],
            }
      )
    );
  }

  function removeObjectFieldValueDraft(objectIndex: number, fieldIndex: number) {
    setObjectDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex !== objectIndex
          ? draft
          : {
              ...draft,
              fieldValueDrafts: draft.fieldValueDrafts.filter(
                (_, currentFieldIndex) => currentFieldIndex !== fieldIndex
              ),
            }
      )
    );
  }

  function getObjectFieldValue(
    objectDraft: ObjectDraft,
    fieldId: string,
    fallback = ""
  ): string {
    return (
      objectDraft.fieldValueDrafts.find((fieldDraft) => fieldDraft.fieldId === fieldId)
        ?.value ?? fallback
    );
  }

  const objectTypeFieldDefinitions = useMemo(() => {
    return Object.fromEntries(
      objectTypeDrafts.map((draft) => {
        try {
          return [draft.id.trim(), buildObjectTypeFieldsFromDrafts(draft.fieldDrafts)];
        } catch {
          return [draft.id.trim(), {}];
        }
      })
    ) as Record<string, Record<string, FieldDefinition>>;
  }, [objectTypeDrafts]);

  function renderReferenceInput({
    label,
    value,
    placeholder,
    allowBindings,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    placeholder: string;
    allowBindings: boolean;
    options: { id: string; label: string }[];
    onChange: (value: string) => void;
  }) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        {allowBindings ? (
          <>
            <Input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
            />
            <p className="text-xs text-muted-foreground">
              Use a concrete ID or a parameter binding like `$target`.
            </p>
          </>
        ) : (
          <Select
            value={value || "__none__"}
            onValueChange={(nextValue) =>
              onChange(nextValue && nextValue !== "__none__" ? nextValue : "")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    );
  }

  function renderOperationDraftList({
    drafts,
    onAdd,
    onRemove,
    onUpdate,
    onUpdateCreateObjectVisibility,
    onUpdateCreateObjectFieldValues,
    allowBindings = false,
    label = "Operations",
    emptyLabel = "No operations defined yet.",
  }: {
    drafts: OperationDraft[];
    onAdd: () => void;
    onRemove: (index: number) => void;
    onUpdate: (
      operationIndex: number,
      field: keyof OperationDraft,
      value: string | ObjectFieldValueDraft[]
    ) => void;
    onUpdateCreateObjectVisibility: (
      operationIndex: number,
      value: "visible" | "hidden" | "revealed"
    ) => void;
    onUpdateCreateObjectFieldValues: (
      operationIndex: number,
      value: ObjectFieldValueDraft[]
    ) => void;
    allowBindings?: boolean;
    label?: string;
    emptyLabel?: string;
  }) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label>{label}</Label>
          <Button variant="outline" size="sm" onClick={onAdd}>
            Add operation
          </Button>
        </div>
        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <div className="space-y-3">
            {drafts.map((operationDraft, operationIndex) => (
              <div
                key={`${operationDraft.op}-${operationIndex}`}
                className="space-y-3 rounded-md border p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    Operation {operationIndex + 1}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(operationIndex)}
                  >
                    Remove
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Operation type</Label>
                  <Select
                    value={operationDraft.op}
                    onValueChange={(value) =>
                      onUpdate(
                        operationIndex,
                        "op",
                        value ?? "setWorldVariable"
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATION_TYPE_OPTIONS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(operationDraft.op === "adjustActorResource" ||
                  operationDraft.op === "setActorResource") && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {renderReferenceInput({
                      label: "Actor",
                      value: operationDraft.actor,
                      placeholder: allowBindings
                        ? "actor_player or $actor"
                        : "Select actor",
                      allowBindings,
                      options: actorOptions,
                      onChange: (value) =>
                        onUpdate(operationIndex, "actor", value),
                    })}
                    {renderReferenceInput({
                      label: "Resource",
                      value: operationDraft.resource,
                      placeholder: allowBindings
                        ? "resource_gold or $resource"
                        : "Select resource",
                      allowBindings,
                      options: resourceOptions,
                      onChange: (value) =>
                        onUpdate(operationIndex, "resource", value),
                    })}
                    <div className="space-y-2">
                      <Label>
                        {operationDraft.op === "adjustActorResource"
                          ? "Delta"
                          : "Value"}
                      </Label>
                      <Input
                        value={
                          operationDraft.op === "adjustActorResource"
                            ? operationDraft.delta
                            : operationDraft.value
                        }
                        inputMode="numeric"
                        onChange={(event) =>
                          onUpdate(
                            operationIndex,
                            operationDraft.op === "adjustActorResource"
                              ? "delta"
                              : "value",
                            event.target.value
                          )
                        }
                        placeholder="0"
                      />
                    </div>
                  </div>
                )}

                {(operationDraft.op === "adjustRelationship" ||
                  operationDraft.op === "setRelationshipType") && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {renderReferenceInput({
                      label: "Relationship",
                      value: operationDraft.relationship,
                      placeholder: allowBindings
                        ? "rel_player_rival or $relationship"
                        : "Select relationship",
                      allowBindings,
                      options: relationshipOptions,
                      onChange: (value) =>
                        onUpdate(operationIndex, "relationship", value),
                    })}
                    <div className="space-y-2">
                      <Label>
                        {operationDraft.op === "adjustRelationship"
                          ? "Delta"
                          : "Value"}
                      </Label>
                      <Input
                        value={
                          operationDraft.op === "adjustRelationship"
                            ? operationDraft.delta
                            : operationDraft.value
                        }
                        onChange={(event) =>
                          onUpdate(
                            operationIndex,
                            operationDraft.op === "adjustRelationship"
                              ? "delta"
                              : "value",
                            event.target.value
                          )
                        }
                        placeholder={
                          operationDraft.op === "adjustRelationship"
                            ? "10"
                            : "allied"
                        }
                      />
                    </div>
                  </div>
                )}

                {(operationDraft.op === "adjustWorldVariable" ||
                  operationDraft.op === "setWorldVariable") && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {renderReferenceInput({
                      label: "World variable",
                      value: operationDraft.variable,
                      placeholder: allowBindings
                        ? "world_season or $worldVariable"
                        : "Select world variable",
                      allowBindings,
                      options: worldVariableOptions,
                      onChange: (value) =>
                        onUpdate(operationIndex, "variable", value),
                    })}
                    <div className="space-y-2">
                      <Label>
                        {operationDraft.op === "adjustWorldVariable"
                          ? "Delta"
                          : "Value"}
                      </Label>
                      <Input
                        value={
                          operationDraft.op === "adjustWorldVariable"
                            ? operationDraft.delta
                            : operationDraft.value
                        }
                        onChange={(event) =>
                          onUpdate(
                            operationIndex,
                            operationDraft.op === "adjustWorldVariable"
                              ? "delta"
                              : "value",
                            event.target.value
                          )
                        }
                        placeholder={
                          operationDraft.op === "adjustWorldVariable"
                            ? "-1"
                            : "Winter"
                        }
                      />
                    </div>
                  </div>
                )}

                {(operationDraft.op === "setObjectField" ||
                  operationDraft.op === "adjustObjectField") && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {renderReferenceInput({
                      label: "Object",
                      value: operationDraft.object,
                      placeholder: allowBindings
                        ? "object_pass or $location"
                        : "Select object",
                      allowBindings,
                      options: objectOptions,
                      onChange: (value) =>
                        onUpdate(operationIndex, "object", value),
                    })}
                    <div className="space-y-2">
                      <Label>Field</Label>
                      <Input
                        value={operationDraft.field}
                        onChange={(event) =>
                          onUpdate(operationIndex, "field", event.target.value)
                        }
                        placeholder="status"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>
                        {operationDraft.op === "adjustObjectField"
                          ? "Delta"
                          : "Value"}
                      </Label>
                      <Input
                        value={
                          operationDraft.op === "adjustObjectField"
                            ? operationDraft.delta
                            : operationDraft.value
                        }
                        onChange={(event) =>
                          onUpdate(
                            operationIndex,
                            operationDraft.op === "adjustObjectField"
                              ? "delta"
                              : "value",
                            event.target.value
                          )
                        }
                        placeholder={
                          operationDraft.op === "adjustObjectField"
                            ? "1"
                            : "blocked"
                        }
                      />
                    </div>
                  </div>
                )}

                {operationDraft.op === "createObject" && (
                  <div className="space-y-3">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>ID</Label>
                        <Input
                          value={operationDraft.createObjectId}
                          onChange={(event) =>
                            onUpdate(
                              operationIndex,
                              "createObjectId",
                              event.target.value
                            )
                          }
                          placeholder="object_hidden_cache"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Type ID</Label>
                        {allowBindings ? (
                          <>
                            <Input
                              value={operationDraft.createObjectTypeId}
                              onChange={(event) =>
                                onUpdate(
                                  operationIndex,
                                  "createObjectTypeId",
                                  event.target.value
                                )
                              }
                              placeholder="location or $objectType"
                            />
                            <p className="text-xs text-muted-foreground">
                              Use a concrete type ID for typed fields, or a binding
                              when the created object type is dynamic.
                            </p>
                          </>
                        ) : (
                          <Select
                            value={operationDraft.createObjectTypeId || "__none__"}
                            onValueChange={(value) =>
                              onUpdate(
                                operationIndex,
                                "createObjectTypeId",
                                value && value !== "__none__" ? value : ""
                              )
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select object type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No type selected</SelectItem>
                              {objectTypeDrafts.map((objectType) => {
                                const typeId = objectType.id.trim();
                                if (!typeId) return null;
                                return (
                                  <SelectItem key={typeId} value={typeId}>
                                    {objectType.label.trim() || typeId}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={operationDraft.createObjectName}
                          onChange={(event) =>
                            onUpdate(
                              operationIndex,
                              "createObjectName",
                              event.target.value
                            )
                          }
                          placeholder="Hidden Cache"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Visibility</Label>
                      <Select
                        value={operationDraft.createObjectVisibility}
                        onValueChange={(value) =>
                          onUpdateCreateObjectVisibility(
                            operationIndex,
                            (value as "visible" | "hidden" | "revealed") ??
                              "visible"
                          )
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="visible">visible</SelectItem>
                          <SelectItem value="hidden">hidden</SelectItem>
                          <SelectItem value="revealed">revealed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(() => {
                      const typeId = operationDraft.createObjectTypeId.trim();
                      const typedFields =
                        typeId && !typeId.startsWith("$")
                          ? objectTypeFieldDefinitions[typeId] ?? {}
                          : {};
                      const typedFieldEntries = Object.entries(typedFields);
                      const customFieldDrafts =
                        operationDraft.createObjectFieldValueDrafts
                          .map((fieldDraft, fieldIndex) => ({
                            fieldDraft,
                            fieldIndex,
                          }))
                          .filter(
                            ({ fieldDraft }) =>
                              !fieldDraft.fieldId.trim() ||
                              typedFields[fieldDraft.fieldId.trim()] === undefined
                          );

                      const setCreateObjectFieldValueDrafts = (
                        nextDrafts: ObjectFieldValueDraft[]
                      ) => onUpdateCreateObjectFieldValues(operationIndex, nextDrafts);

                      const upsertCreateObjectFieldValueDraft = (
                        fieldId: string,
                        value: string
                      ) => {
                        const normalizedFieldId = fieldId.trim();
                        const existingIndex =
                          operationDraft.createObjectFieldValueDrafts.findIndex(
                            (fieldDraft) => fieldDraft.fieldId === normalizedFieldId
                          );

                        if (existingIndex === -1) {
                          setCreateObjectFieldValueDrafts([
                            ...operationDraft.createObjectFieldValueDrafts,
                            { fieldId: normalizedFieldId, value },
                          ]);
                          return;
                        }

                        setCreateObjectFieldValueDrafts(
                          operationDraft.createObjectFieldValueDrafts.map(
                            (fieldDraft, index) =>
                              index === existingIndex
                                ? { ...fieldDraft, value }
                                : fieldDraft
                          )
                        );
                      };

                      const updateCreateObjectFieldValueDraft = (
                        fieldIndex: number,
                        field: keyof ObjectFieldValueDraft,
                        value: string
                      ) =>
                        setCreateObjectFieldValueDrafts(
                          operationDraft.createObjectFieldValueDrafts.map(
                            (fieldDraft, currentFieldIndex) =>
                              currentFieldIndex === fieldIndex
                                ? { ...fieldDraft, [field]: value }
                                : fieldDraft
                          )
                        );

                      const removeCreateObjectFieldValueDraft = (fieldIndex: number) =>
                        setCreateObjectFieldValueDrafts(
                          operationDraft.createObjectFieldValueDrafts.filter(
                            (_, currentFieldIndex) => currentFieldIndex !== fieldIndex
                          )
                        );

                      const addCreateObjectFieldValueDraft = () =>
                        setCreateObjectFieldValueDrafts([
                          ...operationDraft.createObjectFieldValueDrafts,
                          { fieldId: "", value: "" },
                        ]);

                      const getCreateObjectFieldValue = (
                        fieldId: string,
                        fallback = ""
                      ) =>
                        operationDraft.createObjectFieldValueDrafts.find(
                          (fieldDraft) => fieldDraft.fieldId === fieldId
                        )?.value ?? fallback;

                      return (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <Label>Created object fields</Label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={addCreateObjectFieldValueDraft}
                            >
                              Add custom field
                            </Button>
                          </div>

                          {typedFieldEntries.length === 0 && customFieldDrafts.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {typeId.startsWith("$")
                                ? "Typed fields are unavailable while type ID is bound dynamically. Add custom fields if needed."
                                : "No field definitions available yet for this created object."}
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {typedFieldEntries.map(([fieldId, fieldDefinition]) => {
                                const currentValue = getCreateObjectFieldValue(
                                  fieldId,
                                  typeof fieldDefinition.defaultValue === "string" ||
                                    typeof fieldDefinition.defaultValue === "number" ||
                                    typeof fieldDefinition.defaultValue === "boolean"
                                    ? String(fieldDefinition.defaultValue)
                                    : ""
                                );

                                return (
                                  <div
                                    key={`${fieldId}-${operationIndex}`}
                                    className="space-y-2 rounded-md border p-3"
                                  >
                                    <div>
                                      <p className="text-sm font-medium">
                                        {fieldDefinition.label || fieldId}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {fieldId} · {fieldDefinition.kind}
                                        {fieldDefinition.required ? " · required" : ""}
                                      </p>
                                    </div>

                                    {fieldDefinition.kind === "enum" &&
                                    Array.isArray(fieldDefinition.values) ? (
                                      <Select
                                        value={currentValue || "__none__"}
                                        onValueChange={(value) =>
                                          upsertCreateObjectFieldValueDraft(
                                            fieldId,
                                            value && value !== "__none__" ? value : ""
                                          )
                                        }
                                      >
                                        <SelectTrigger className="w-full">
                                          <SelectValue placeholder="Select a value" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__none__">No value</SelectItem>
                                          {fieldDefinition.values.map((value) => (
                                            <SelectItem key={value} value={value}>
                                              {value}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : fieldDefinition.kind === "boolean" ? (
                                      <Select
                                        value={currentValue || "__none__"}
                                        onValueChange={(value) =>
                                          upsertCreateObjectFieldValueDraft(
                                            fieldId,
                                            value && value !== "__none__" ? value : ""
                                          )
                                        }
                                      >
                                        <SelectTrigger className="w-full">
                                          <SelectValue placeholder="Select true or false" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__none__">No value</SelectItem>
                                          <SelectItem value="true">true</SelectItem>
                                          <SelectItem value="false">false</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <Input
                                        value={currentValue}
                                        inputMode={
                                          fieldDefinition.kind === "number"
                                            ? "numeric"
                                            : undefined
                                        }
                                        onChange={(event) =>
                                          upsertCreateObjectFieldValueDraft(
                                            fieldId,
                                            event.target.value
                                          )
                                        }
                                        placeholder={
                                          fieldDefinition.kind === "number"
                                            ? "0"
                                            : "Value"
                                        }
                                      />
                                    )}
                                  </div>
                                );
                              })}

                              {customFieldDrafts.map(({ fieldDraft, fieldIndex }) => (
                                <div
                                  key={`${fieldDraft.fieldId || "custom-create-field"}-${fieldIndex}`}
                                  className="space-y-3 rounded-md border border-dashed p-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-medium">Custom field</p>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        removeCreateObjectFieldValueDraft(fieldIndex)
                                      }
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                  <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                      <Label>Field ID</Label>
                                      <Input
                                        value={fieldDraft.fieldId}
                                        onChange={(event) =>
                                          updateCreateObjectFieldValueDraft(
                                            fieldIndex,
                                            "fieldId",
                                            event.target.value
                                          )
                                        }
                                        placeholder="custom_field"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Value</Label>
                                      <Input
                                        value={fieldDraft.value}
                                        onChange={(event) =>
                                          updateCreateObjectFieldValueDraft(
                                            fieldIndex,
                                            "value",
                                            event.target.value
                                          )
                                        }
                                        placeholder="Parsed as string, number, or boolean"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {(operationDraft.op === "archiveObject" ||
                  operationDraft.op === "revealObject" ||
                  operationDraft.op === "hideObject") && (
                  <div className="space-y-2">
                    {renderReferenceInput({
                      label: "Object",
                      value: operationDraft.object,
                      placeholder: allowBindings
                        ? "object_pass or $target"
                        : "Select object",
                      allowBindings,
                      options: objectOptions,
                      onChange: (value) =>
                        onUpdate(operationIndex, "object", value),
                    })}
                  </div>
                )}

                {operationDraft.op === "addEvent" && (
                  <div className="space-y-3">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Event type</Label>
                        <Input
                          value={operationDraft.eventType}
                          onChange={(event) =>
                            onUpdate(
                              operationIndex,
                              "eventType",
                              event.target.value
                            )
                          }
                          placeholder="weather"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Involved actors</Label>
                        <Input
                          value={operationDraft.involvedActors}
                          onChange={(event) =>
                            onUpdate(
                              operationIndex,
                              "involvedActors",
                              event.target.value
                            )
                          }
                          placeholder={
                            allowBindings
                              ? "actor_player, $actor"
                              : "actor_player, actor_rival"
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        rows={3}
                        value={operationDraft.description}
                        onChange={(event) =>
                          onUpdate(
                            operationIndex,
                            "description",
                            event.target.value
                          )
                        }
                        placeholder={
                          allowBindings
                            ? "$actor fortifies $location"
                            : "Snow closes the road."
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderValidationIssues(result: ValidationResult, validLabel = "Valid") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant={result.valid ? "default" : "destructive"}>
            {result.valid ? validLabel : "Validation issues"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {result.issues.length} issue
            {result.issues.length === 1 ? "" : "s"}
          </span>
        </div>

        {result.issues.length > 0 && (
          <div className="space-y-2">
            {result.issues.map((issue, index) => (
              <Alert
                key={`${issue.path}-${index}`}
                variant={issue.severity === "error" ? "destructive" : "default"}
              >
                <AlertDescription>
                  <p className="font-medium">
                    {issue.severity.toUpperCase()} · {issue.path}
                  </p>
                  <p>{issue.message}</p>
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderDiagnostics(
    diagnostics: DiagnosticIssue[],
    healthyLabel = "No diagnostics"
  ) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant={diagnostics.length === 0 ? "default" : "outline"}>
            {diagnostics.length === 0 ? healthyLabel : "Diagnostics"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {diagnostics.length} item
            {diagnostics.length === 1 ? "" : "s"}
          </span>
        </div>

        {diagnostics.length > 0 && (
          <div className="space-y-2">
            {diagnostics.map((diagnostic, index) => (
              <Alert key={`${diagnostic.code}-${diagnostic.path}-${index}`}>
                <AlertDescription>
                  <p className="font-medium">
                    {diagnostic.code} · {diagnostic.path}
                  </p>
                  <p>{diagnostic.message}</p>
                  {diagnostic.recommendation && (
                    <p className="mt-2 text-muted-foreground">
                      {diagnostic.recommendation}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate Draft From Prompt</CardTitle>
          <CardDescription>
            Ask the LLM for a draft scenario package. The generated package stays
            local to this editor until you explicitly apply it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="package-draft-prompt">Author prompt</Label>
            <Textarea
              id="package-draft-prompt"
              rows={6}
              value={draftPrompt}
              onChange={(event) => setDraftPrompt(event.target.value)}
              placeholder="Describe the scenario objects, reusable effects, trigger rules, and choice guidance you want the package to include."
            />
            <p className="text-xs text-muted-foreground">
              The backend uses scenario context and existing entities as input,
              then validates the generated package before it can be applied.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void generateDraft()} disabled={generatingDraft}>
              {generatingDraft ? "Generating..." : "Generate draft"}
            </Button>
            {draftResult && (
              <Button
                variant="outline"
                onClick={() => setDraftResult(null)}
                disabled={generatingDraft || applyingDraft}
              >
                Clear draft
              </Button>
            )}
          </div>

          {draftError && <p className="text-sm text-destructive">{draftError}</p>}

          {draftResult && (
            <div className="space-y-4 rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-medium">Generated Draft</p>
                  <p className="text-sm text-muted-foreground">
                    Review validation results before applying this package to the
                    scenario.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void applyDraft()}
                  disabled={
                    applyingDraft ||
                    !isRecord(draftResult.draft) ||
                    !draftResult.validation.valid
                  }
                >
                  {applyingDraft ? "Applying..." : "Apply draft to package"}
                </Button>
              </div>

              <Alert>
                <AlertDescription>
                  Generated drafts do not affect the saved scenario package until
                  you click Apply draft to package.
                </AlertDescription>
              </Alert>

              {draftResult.critique.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Critique</p>
                  <div className="space-y-2">
                    {draftResult.critique.map((item, index) => (
                      <p key={`${item}-${index}`} className="text-sm text-muted-foreground">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {renderValidationIssues(draftResult.validation, "Draft valid")}
              {renderDiagnostics(
                draftResult.diagnostics,
                "Draft diagnostics clear"
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium">Draft JSON</p>
                <ScrollArea className="h-96 rounded-md border bg-muted/20">
                  <pre className="p-4 text-xs leading-5">
                    {draftResult.draft
                      ? JSON.stringify(draftResult.draft, null, 2)
                      : "No draft JSON was produced."}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Scenario Package</CardTitle>
              <CardDescription>
                Inspect the scenario DSL package backing this scenario.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void validatePackage()}
              disabled={loading}
            >
              {loading ? "Validating..." : "Validate package"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {scenarioPackage === null ? (
            <>
              <Alert>
                <AlertDescription>
                  No scenario package is attached yet. Sessions cannot start until
                  this scenario has a valid package.
                </AlertDescription>
              </Alert>
              {validation && renderValidationIssues(validation)}
              {validation && renderDiagnostics(validation.diagnostics)}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </>
          ) : (
            <>
              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <p className="text-base font-medium">Choice Policy</p>
                  <p className="text-sm text-muted-foreground">
                    Edit the package-backed choice generation bounds and guidance.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="package-min-choices">Minimum choices</Label>
                    <Input
                      id="package-min-choices"
                      value={minChoices}
                      onChange={(event) => setMinChoices(event.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="package-max-choices">Maximum choices</Label>
                    <Input
                      id="package-max-choices"
                      value={maxChoices}
                      onChange={(event) => setMaxChoices(event.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="package-guidance">Guidance</Label>
                  <Textarea
                    id="package-guidance"
                    rows={3}
                    value={guidance}
                    onChange={(event) => setGuidance(event.target.value)}
                    placeholder="Steer the choice generator toward scenario-specific strategy."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="package-preferred-effects">
                    Preferred effect IDs
                  </Label>
                  <Input
                    id="package-preferred-effects"
                    value={preferredEffectIds}
                    onChange={(event) =>
                      setPreferredEffectIds(event.target.value)
                    }
                    placeholder="effect_one, effect_two"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated effect IDs already defined in the package.
                  </p>
                </div>

                {policyError && (
                  <p className="text-sm text-destructive">{policyError}</p>
                )}

                <Button
                  variant="outline"
                  onClick={() => void saveChoicePolicy()}
                  disabled={savingPolicy}
                >
                  {savingPolicy ? "Saving..." : "Save choice policy"}
                </Button>
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-medium">Effect Definitions</p>
                    <p className="text-sm text-muted-foreground">
                      Define reusable package effects with typed parameters and
                      per-intensity operations.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addEffectDefinitionDraft}
                  >
                    Add effect
                  </Button>
                </div>

                <Alert>
                  <AlertDescription>
                    Effect operations may reference parameters with bindings like{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      $target
                    </code>
                    . The backend resolves those bindings when the effect is
                    applied.
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  {effectDefinitionDrafts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No effect definitions defined yet.
                    </p>
                  ) : (
                    effectDefinitionDrafts.map((draft, index) => (
                      <div
                        key={`${draft.id || "effect"}-${index}`}
                        className="space-y-4 rounded-md border p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">Effect {index + 1}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeEffectDefinitionDraft(index)}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`effect-id-${index}`}>ID</Label>
                            <Input
                              id={`effect-id-${index}`}
                              value={draft.id}
                              onChange={(event) =>
                                updateEffectDefinitionDraft(
                                  index,
                                  "id",
                                  event.target.value
                                )
                              }
                              placeholder="fortify_location"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`effect-label-${index}`}>Label</Label>
                            <Input
                              id={`effect-label-${index}`}
                              value={draft.label}
                              onChange={(event) =>
                                updateEffectDefinitionDraft(
                                  index,
                                  "label",
                                  event.target.value
                                )
                              }
                              placeholder="Fortify Location"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`effect-description-${index}`}>
                            Description
                          </Label>
                          <Textarea
                            id={`effect-description-${index}`}
                            rows={3}
                            value={draft.description}
                            onChange={(event) =>
                              updateEffectDefinitionDraft(
                                index,
                                "description",
                                event.target.value
                              )
                            }
                            placeholder="Spend resources to improve a known position."
                          />
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <Label>Parameters</Label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addEffectParameterDraft(index)}
                            >
                              Add parameter
                            </Button>
                          </div>
                          {draft.parameterDrafts.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No parameters defined. This effect can only use
                              concrete IDs in its operations.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {draft.parameterDrafts.map(
                                (parameterDraft, parameterIndex) => (
                                  <div
                                    key={`${parameterDraft.name || "parameter"}-${parameterIndex}`}
                                    className="space-y-3 rounded-md border p-3"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-sm font-medium">
                                        Parameter {parameterIndex + 1}
                                      </p>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          removeEffectParameterDraft(
                                            index,
                                            parameterIndex
                                          )
                                        }
                                      >
                                        Remove
                                      </Button>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-3">
                                      <div className="space-y-2">
                                        <Label
                                          htmlFor={`effect-parameter-name-${index}-${parameterIndex}`}
                                        >
                                          Name
                                        </Label>
                                        <Input
                                          id={`effect-parameter-name-${index}-${parameterIndex}`}
                                          value={parameterDraft.name}
                                          onChange={(event) =>
                                            updateEffectParameterDraft(
                                              index,
                                              parameterIndex,
                                              "name",
                                              event.target.value
                                            )
                                          }
                                          placeholder="location"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Type</Label>
                                        <Select
                                          value={parameterDraft.type}
                                          onValueChange={(value) =>
                                            updateEffectParameterDraft(
                                              index,
                                              parameterIndex,
                                              "type",
                                              value ?? "actor"
                                            )
                                          }
                                        >
                                          <SelectTrigger className="w-full">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {EFFECT_PARAMETER_TYPE_OPTIONS.map((type) => (
                                              <SelectItem key={type} value={type}>
                                                {type}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Object type</Label>
                                        <Select
                                          value={
                                            parameterDraft.type === "object" &&
                                            parameterDraft.objectType
                                              ? parameterDraft.objectType
                                              : "__none__"
                                          }
                                          onValueChange={(value) =>
                                            updateEffectParameterDraft(
                                              index,
                                              parameterIndex,
                                              "objectType",
                                              value && value !== "__none__" ? value : ""
                                            )
                                          }
                                          disabled={parameterDraft.type !== "object"}
                                        >
                                          <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Any object type" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="__none__">
                                              Any object type
                                            </SelectItem>
                                            {objectTypeDrafts.map((objectType) => (
                                              <SelectItem
                                                key={objectType.id || objectType.label}
                                                value={objectType.id}
                                              >
                                                {objectType.id || objectType.label || "Unnamed type"}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <Switch
                                        checked={parameterDraft.required}
                                        onCheckedChange={(checked) =>
                                          updateEffectParameterDraft(
                                            index,
                                            parameterIndex,
                                            "required",
                                            checked
                                          )
                                        }
                                      />
                                      <Label>Required binding</Label>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-4">
                          {EFFECT_INTENSITY_OPTIONS.map((intensity) => (
                            <div
                              key={`${draft.id || "effect"}-${intensity}`}
                              className="space-y-3 rounded-md border border-dashed p-3"
                            >
                              <div>
                                <p className="text-sm font-medium capitalize">
                                  {intensity} intensity
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Leave empty if this effect does not support this
                                  intensity.
                                </p>
                              </div>
                              {renderOperationDraftList({
                                drafts: draft.intensityDrafts[intensity],
                                onAdd: () =>
                                  addEffectOperationDraft(index, intensity),
                                onRemove: (operationIndex) =>
                                  removeEffectOperationDraft(
                                    index,
                                    intensity,
                                    operationIndex
                                  ),
                                onUpdate: (operationIndex, field, value) =>
                                  updateEffectOperationDraft(
                                    index,
                                    intensity,
                                    operationIndex,
                                    field,
                                    value
                                  ),
                                onUpdateCreateObjectVisibility: (
                                  operationIndex,
                                  value
                                ) =>
                                  updateEffectCreateObjectVisibility(
                                    index,
                                    intensity,
                                    operationIndex,
                                    value
                                  ),
                                onUpdateCreateObjectFieldValues: (
                                  operationIndex,
                                  value
                                ) =>
                                  updateEffectOperationDraft(
                                    index,
                                    intensity,
                                    operationIndex,
                                    "createObjectFieldValueDrafts",
                                    value
                                  ),
                                allowBindings: true,
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {effectError && (
                  <p className="text-sm text-destructive">{effectError}</p>
                )}

                <Button
                  variant="outline"
                  onClick={() => void saveEffectDefinitions()}
                  disabled={savingEffects}
                >
                  {savingEffects ? "Saving..." : "Save effect definitions"}
                </Button>
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <p className="text-base font-medium">Actor Capabilities</p>
                  <p className="text-sm text-muted-foreground">
                    Control which package effect IDs each actor may use.
                  </p>
                </div>

                <div className="space-y-3">
                  {actors.map((actor) => (
                    <div key={actor.id} className="space-y-2">
                      <Label htmlFor={`capability-${actor.id}`}>
                        {actor.name}
                        {actor.isPlayer ? " (Player)" : ""}
                      </Label>
                      <Input
                        id={`capability-${actor.id}`}
                        value={capabilityValues[actor.id] ?? ""}
                        onChange={(event) =>
                          setCapabilityValues((current) => ({
                            ...current,
                            [actor.id]: event.target.value,
                          }))
                        }
                        placeholder="effect_one, effect_two"
                      />
                    </div>
                  ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  Leave blank to give an actor no explicitly assigned effects.
                  Runtime fallback behavior remains unchanged for scenarios
                  without strict capability rules.
                </p>

                {capabilityError && (
                  <p className="text-sm text-destructive">{capabilityError}</p>
                )}

                <Button
                  variant="outline"
                  onClick={() => void saveActorCapabilities()}
                  disabled={savingCapabilities}
                >
                  {savingCapabilities ? "Saving..." : "Save actor capabilities"}
                </Button>
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-medium">Trigger Rules</p>
                    <p className="text-sm text-muted-foreground">
                      Define package-backed conditional rules with typed
                      operations.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addTriggerRuleDraft}>
                    Add trigger rule
                  </Button>
                </div>

                <div className="space-y-4">
                  {triggerRuleDrafts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No trigger rules defined yet.
                    </p>
                  ) : (
                    triggerRuleDrafts.map((draft, index) => (
                      <div key={`${draft.id || "trigger"}-${index}`} className="space-y-4 rounded-md border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">Rule {index + 1}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeTriggerRuleDraft(index)}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`trigger-id-${index}`}>ID</Label>
                            <Input
                              id={`trigger-id-${index}`}
                              value={draft.id}
                              onChange={(event) =>
                                updateTriggerRuleDraft(index, "id", event.target.value)
                              }
                              placeholder="winter_arrival"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`trigger-description-${index}`}>
                              Description
                            </Label>
                            <Input
                              id={`trigger-description-${index}`}
                              value={draft.description}
                              onChange={(event) =>
                                updateTriggerRuleDraft(
                                  index,
                                  "description",
                                  event.target.value
                                )
                              }
                              placeholder="Describe what this rule does"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Switch
                            checked={draft.once}
                            onCheckedChange={(checked) =>
                              updateTriggerRuleDraft(index, "once", checked)
                            }
                          />
                          <Label>Run once</Label>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor={`trigger-world-variable-${index}`}>
                              World variable
                            </Label>
                            <Input
                              id={`trigger-world-variable-${index}`}
                              value={draft.worldVariable}
                              onChange={(event) =>
                                updateTriggerRuleDraft(
                                  index,
                                  "worldVariable",
                                  event.target.value
                                )
                              }
                              placeholder="world_turns_until_winter"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`trigger-object-${index}`}>Object</Label>
                            <Input
                              id={`trigger-object-${index}`}
                              value={draft.object}
                              onChange={(event) =>
                                updateTriggerRuleDraft(index, "object", event.target.value)
                              }
                              placeholder="object_western_pass"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`trigger-field-${index}`}>Field</Label>
                            <Input
                              id={`trigger-field-${index}`}
                              value={draft.field}
                              onChange={(event) =>
                                updateTriggerRuleDraft(index, "field", event.target.value)
                              }
                              placeholder="status"
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor={`trigger-equals-${index}`}>Equals</Label>
                            <Input
                              id={`trigger-equals-${index}`}
                              value={draft.equals}
                              onChange={(event) =>
                                updateTriggerRuleDraft(index, "equals", event.target.value)
                              }
                              placeholder="Winter"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`trigger-lte-${index}`}>LTE</Label>
                            <Input
                              id={`trigger-lte-${index}`}
                              value={draft.lte}
                              onChange={(event) =>
                                updateTriggerRuleDraft(index, "lte", event.target.value)
                              }
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`trigger-gte-${index}`}>GTE</Label>
                            <Input
                              id={`trigger-gte-${index}`}
                              value={draft.gte}
                              onChange={(event) =>
                                updateTriggerRuleDraft(index, "gte", event.target.value)
                              }
                              placeholder="100"
                            />
                          </div>
                        </div>

                        {renderOperationDraftList({
                          drafts: draft.operationDrafts,
                          onAdd: () => addTriggerOperationDraft(index),
                          onRemove: (operationIndex) =>
                            removeTriggerOperationDraft(index, operationIndex),
                          onUpdate: (operationIndex, field, value) =>
                            updateTriggerOperationDraft(
                              index,
                              operationIndex,
                              field,
                              value
                            ),
                          onUpdateCreateObjectVisibility: (
                            operationIndex,
                            value
                          ) =>
                            updateTriggerCreateObjectVisibility(
                              index,
                              operationIndex,
                              value
                            ),
                          onUpdateCreateObjectFieldValues: (
                            operationIndex,
                            value
                          ) =>
                            updateTriggerOperationDraft(
                              index,
                              operationIndex,
                              "createObjectFieldValueDrafts",
                              value
                            ),
                        })}
                      </div>
                    ))
                  )}
                </div>

                {triggerRuleError && (
                  <p className="text-sm text-destructive">{triggerRuleError}</p>
                )}

                <Button
                  variant="outline"
                  onClick={() => void saveTriggerRules()}
                  disabled={savingTriggerRules}
                >
                  {savingTriggerRules ? "Saving..." : "Save trigger rules"}
                </Button>
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-medium">Object Types</p>
                    <p className="text-sm text-muted-foreground">
                      Define scenario object schemas with typed field rows.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addObjectTypeDraft}>
                    Add object type
                  </Button>
                </div>

                <div className="space-y-4">
                  {objectTypeDrafts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No object types defined yet.
                    </p>
                  ) : (
                    objectTypeDrafts.map((draft, index) => (
                      <div key={`${draft.id || "object-type"}-${index}`} className="space-y-4 rounded-md border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">Object type {index + 1}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeObjectTypeDraft(index)}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`object-type-id-${index}`}>ID</Label>
                            <Input
                              id={`object-type-id-${index}`}
                              value={draft.id}
                              onChange={(event) =>
                                updateObjectTypeDraft(index, "id", event.target.value)
                              }
                              placeholder="location"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`object-type-label-${index}`}>
                              Label
                            </Label>
                            <Input
                              id={`object-type-label-${index}`}
                              value={draft.label}
                              onChange={(event) =>
                                updateObjectTypeDraft(index, "label", event.target.value)
                              }
                              placeholder="Location"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`object-type-description-${index}`}>
                            Description
                          </Label>
                          <Input
                            id={`object-type-description-${index}`}
                            value={draft.description}
                            onChange={(event) =>
                              updateObjectTypeDraft(
                                index,
                                "description",
                                event.target.value
                              )
                            }
                            placeholder="What this object type represents"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <Label>Fields</Label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addObjectTypeFieldDraft(index)}
                            >
                              Add field
                            </Button>
                          </div>
                          {draft.fieldDrafts.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No fields defined yet.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {draft.fieldDrafts.map((fieldDraft, fieldIndex) => (
                                <div
                                  key={`${fieldDraft.id || "field"}-${fieldIndex}`}
                                  className="space-y-3 rounded-md border p-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-medium">
                                      Field {fieldIndex + 1}
                                    </p>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        removeObjectTypeFieldDraft(index, fieldIndex)
                                      }
                                    >
                                      Remove
                                    </Button>
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                      <Label htmlFor={`field-id-${index}-${fieldIndex}`}>
                                        ID
                                      </Label>
                                      <Input
                                        id={`field-id-${index}-${fieldIndex}`}
                                        value={fieldDraft.id}
                                        onChange={(event) =>
                                          updateObjectTypeFieldDraft(
                                            index,
                                            fieldIndex,
                                            "id",
                                            event.target.value
                                          )
                                        }
                                        placeholder="defense"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label htmlFor={`field-label-${index}-${fieldIndex}`}>
                                        Label
                                      </Label>
                                      <Input
                                        id={`field-label-${index}-${fieldIndex}`}
                                        value={fieldDraft.label}
                                        onChange={(event) =>
                                          updateObjectTypeFieldDraft(
                                            index,
                                            fieldIndex,
                                            "label",
                                            event.target.value
                                          )
                                        }
                                        placeholder="Defense"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Kind</Label>
                                      <Select
                                        value={fieldDraft.kind}
                                        onValueChange={(value) =>
                                          updateObjectTypeFieldDraft(
                                            index,
                                            fieldIndex,
                                            "kind",
                                            value ?? "string"
                                          )
                                        }
                                      >
                                        <SelectTrigger className="w-full">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {FIELD_KIND_OPTIONS.map((kind) => (
                                            <SelectItem key={kind} value={kind}>
                                              {kind}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  <div className="grid gap-4 md:grid-cols-2">
                                    <div className="flex items-center gap-3">
                                      <Switch
                                        checked={fieldDraft.required}
                                        onCheckedChange={(checked) =>
                                          updateObjectTypeFieldDraft(
                                            index,
                                            fieldIndex,
                                            "required",
                                            checked
                                          )
                                        }
                                      />
                                      <Label>Required</Label>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <Switch
                                        checked={fieldDraft.visible}
                                        onCheckedChange={(checked) =>
                                          updateObjectTypeFieldDraft(
                                            index,
                                            fieldIndex,
                                            "visible",
                                            checked
                                          )
                                        }
                                      />
                                      <Label>Visible to player</Label>
                                    </div>
                                  </div>

                                  {fieldDraft.kind === "number" && (
                                    <div className="grid gap-4 md:grid-cols-2">
                                      <div className="space-y-2">
                                        <Label htmlFor={`field-min-${index}-${fieldIndex}`}>
                                          Min
                                        </Label>
                                        <Input
                                          id={`field-min-${index}-${fieldIndex}`}
                                          value={fieldDraft.min}
                                          inputMode="numeric"
                                          onChange={(event) =>
                                            updateObjectTypeFieldDraft(
                                              index,
                                              fieldIndex,
                                              "min",
                                              event.target.value
                                            )
                                          }
                                          placeholder="0"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label htmlFor={`field-max-${index}-${fieldIndex}`}>
                                          Max
                                        </Label>
                                        <Input
                                          id={`field-max-${index}-${fieldIndex}`}
                                          value={fieldDraft.max}
                                          inputMode="numeric"
                                          onChange={(event) =>
                                            updateObjectTypeFieldDraft(
                                              index,
                                              fieldIndex,
                                              "max",
                                              event.target.value
                                            )
                                          }
                                          placeholder="100"
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {fieldDraft.kind === "enum" && (
                                    <div className="space-y-2">
                                      <Label htmlFor={`field-values-${index}-${fieldIndex}`}>
                                        Enum values
                                      </Label>
                                      <Input
                                        id={`field-values-${index}-${fieldIndex}`}
                                        value={fieldDraft.values}
                                        onChange={(event) =>
                                          updateObjectTypeFieldDraft(
                                            index,
                                            fieldIndex,
                                            "values",
                                            event.target.value
                                          )
                                        }
                                        placeholder="open, blocked, snowbound"
                                      />
                                    </div>
                                  )}

                                  <div className="space-y-2">
                                    <Label htmlFor={`field-default-${index}-${fieldIndex}`}>
                                      Default value
                                    </Label>
                                    <Input
                                      id={`field-default-${index}-${fieldIndex}`}
                                      value={fieldDraft.defaultValue}
                                      onChange={(event) =>
                                        updateObjectTypeFieldDraft(
                                          index,
                                          fieldIndex,
                                          "defaultValue",
                                          event.target.value
                                        )
                                      }
                                      placeholder={
                                        fieldDraft.kind === "boolean"
                                          ? "true"
                                          : fieldDraft.kind === "number"
                                            ? "0"
                                            : fieldDraft.kind === "enum"
                                              ? "open"
                                              : "Optional default"
                                      }
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {objectTypeError && (
                  <p className="text-sm text-destructive">{objectTypeError}</p>
                )}

                <Button
                  variant="outline"
                  onClick={() => void saveObjectTypes()}
                  disabled={savingObjectTypes}
                >
                  {savingObjectTypes ? "Saving..." : "Save object types"}
                </Button>
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-medium">Objects</p>
                    <p className="text-sm text-muted-foreground">
                      Define scenario instances with typed values based on the selected object type.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addObjectDraft}>
                    Add object
                  </Button>
                </div>

                <div className="space-y-4">
                  {objectDrafts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No objects defined yet.
                    </p>
                  ) : (
                    objectDrafts.map((draft, index) => (
                      <div key={`${draft.id || "object"}-${index}`} className="space-y-4 rounded-md border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">Object {index + 1}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeObjectDraft(index)}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor={`object-id-${index}`}>ID</Label>
                            <Input
                              id={`object-id-${index}`}
                              value={draft.id}
                              onChange={(event) =>
                                updateObjectDraft(index, "id", event.target.value)
                              }
                              placeholder="object_western_pass"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`object-type-id-${index}`}>Type ID</Label>
                            <Select
                              value={draft.typeId || "__none__"}
                              onValueChange={(value) =>
                                updateObjectDraft(
                                  index,
                                  "typeId",
                                  value && value !== "__none__" ? value : ""
                                )
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select object type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">No type selected</SelectItem>
                                {objectTypeDrafts.map((objectType) => {
                                  const typeId = objectType.id.trim();
                                  if (!typeId) return null;
                                  return (
                                    <SelectItem key={typeId} value={typeId}>
                                      {objectType.label.trim() || typeId}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`object-name-${index}`}>Name</Label>
                            <Input
                              id={`object-name-${index}`}
                              value={draft.name}
                              onChange={(event) =>
                                updateObjectDraft(index, "name", event.target.value)
                              }
                              placeholder="Western Pass"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Visibility</Label>
                          <Select
                            value={draft.visibility}
                            onValueChange={(value) =>
                              updateObjectVisibility(
                                index,
                                value as "visible" | "hidden" | "revealed"
                              )
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="visible">visible</SelectItem>
                              <SelectItem value="hidden">hidden</SelectItem>
                              <SelectItem value="revealed">revealed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {(() => {
                          const typedFields =
                            objectTypeFieldDefinitions[draft.typeId.trim()] ?? {};
                          const typedFieldEntries = Object.entries(typedFields);
                          const customFieldDrafts = draft.fieldValueDrafts
                            .map((fieldDraft, fieldIndex) => ({
                              fieldDraft,
                              fieldIndex,
                            }))
                            .filter(
                              ({ fieldDraft }) =>
                                !fieldDraft.fieldId.trim() ||
                                typedFields[fieldDraft.fieldId.trim()] === undefined
                            );

                          return (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <Label>Field values</Label>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addObjectFieldValueDraft(index)}
                                >
                                  Add custom field
                                </Button>
                              </div>

                              {typedFieldEntries.length === 0 && customFieldDrafts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No field definitions available yet for this object.
                                </p>
                              ) : (
                                <div className="space-y-3">
                                  {typedFieldEntries.map(([fieldId, fieldDefinition]) => {
                                    const currentValue = getObjectFieldValue(
                                      draft,
                                      fieldId,
                                      typeof fieldDefinition.defaultValue === "string" ||
                                      typeof fieldDefinition.defaultValue === "number" ||
                                      typeof fieldDefinition.defaultValue === "boolean"
                                        ? String(fieldDefinition.defaultValue)
                                        : ""
                                    );

                                    return (
                                      <div
                                        key={`${fieldId}-${index}`}
                                        className="space-y-2 rounded-md border p-3"
                                      >
                                        <div className="flex items-center justify-between gap-3">
                                          <div>
                                            <p className="text-sm font-medium">
                                              {fieldDefinition.label || fieldId}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {fieldId} · {fieldDefinition.kind}
                                              {fieldDefinition.required ? " · required" : ""}
                                            </p>
                                          </div>
                                        </div>

                                        {fieldDefinition.kind === "enum" &&
                                        Array.isArray(fieldDefinition.values) ? (
                                          <Select
                                            value={currentValue || "__none__"}
                                            onValueChange={(value) =>
                                              upsertObjectFieldValueDraft(
                                                index,
                                                fieldId,
                                                value && value !== "__none__" ? value : ""
                                              )
                                            }
                                          >
                                            <SelectTrigger className="w-full">
                                              <SelectValue placeholder="Select a value" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none__">
                                                No value
                                              </SelectItem>
                                              {fieldDefinition.values.map((value) => (
                                                <SelectItem key={value} value={value}>
                                                  {value}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        ) : fieldDefinition.kind === "boolean" ? (
                                          <Select
                                            value={currentValue || "__none__"}
                                            onValueChange={(value) =>
                                              upsertObjectFieldValueDraft(
                                                index,
                                                fieldId,
                                                value && value !== "__none__" ? value : ""
                                              )
                                            }
                                          >
                                            <SelectTrigger className="w-full">
                                              <SelectValue placeholder="Select true or false" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="__none__">
                                                No value
                                              </SelectItem>
                                              <SelectItem value="true">true</SelectItem>
                                              <SelectItem value="false">false</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <Input
                                            value={currentValue}
                                            inputMode={
                                              fieldDefinition.kind === "number"
                                                ? "numeric"
                                                : undefined
                                            }
                                            onChange={(event) =>
                                              upsertObjectFieldValueDraft(
                                                index,
                                                fieldId,
                                                event.target.value
                                              )
                                            }
                                            placeholder={
                                              fieldDefinition.kind === "number"
                                                ? "0"
                                                : "Value"
                                            }
                                          />
                                        )}
                                      </div>
                                    );
                                  })}

                                  {customFieldDrafts.map(({ fieldDraft, fieldIndex }) => (
                                    <div
                                      key={`${fieldDraft.fieldId || "custom-field"}-${fieldIndex}`}
                                      className="space-y-3 rounded-md border border-dashed p-3"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium">Custom field</p>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() =>
                                            removeObjectFieldValueDraft(index, fieldIndex)
                                          }
                                        >
                                          Remove
                                        </Button>
                                      </div>
                                      <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                          <Label htmlFor={`custom-field-id-${index}-${fieldIndex}`}>
                                            Field ID
                                          </Label>
                                          <Input
                                            id={`custom-field-id-${index}-${fieldIndex}`}
                                            value={fieldDraft.fieldId}
                                            onChange={(event) =>
                                              updateObjectFieldValueDraft(
                                                index,
                                                fieldIndex,
                                                "fieldId",
                                                event.target.value
                                              )
                                            }
                                            placeholder="custom_field"
                                          />
                                        </div>
                                        <div className="space-y-2">
                                          <Label htmlFor={`custom-field-value-${index}-${fieldIndex}`}>
                                            Value
                                          </Label>
                                          <Input
                                            id={`custom-field-value-${index}-${fieldIndex}`}
                                            value={fieldDraft.value}
                                            onChange={(event) =>
                                              updateObjectFieldValueDraft(
                                                index,
                                                fieldIndex,
                                                "value",
                                                event.target.value
                                              )
                                            }
                                            placeholder="Parsed as string, number, or boolean"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))
                  )}
                </div>

                {objectError && (
                  <p className="text-sm text-destructive">{objectError}</p>
                )}

                <Button
                  variant="outline"
                  onClick={() => void saveObjects()}
                  disabled={savingObjects}
                >
                  {savingObjects ? "Saving..." : "Save objects"}
                </Button>
              </div>

              {packageSummary && (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">v{packageSummary.version}</Badge>
                  <Badge variant="outline">
                    Object types: {packageSummary.objectTypeCount}
                  </Badge>
                  <Badge variant="outline">
                    Objects: {packageSummary.objectCount}
                  </Badge>
                  <Badge variant="outline">
                    Effects: {packageSummary.effectCount}
                  </Badge>
                  <Badge variant="outline">
                    Capabilities: {packageSummary.capabilityCount}
                  </Badge>
                  <Badge variant="outline">
                    Triggers: {packageSummary.triggerCount}
                  </Badge>
                </div>
              )}

              {validation && renderValidationIssues(validation)}
              {validation && renderDiagnostics(validation.diagnostics)}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="space-y-2">
                <p className="text-sm font-medium">Raw package</p>
                <ScrollArea className="h-96 rounded-md border bg-muted/20">
                  <pre className="p-4 text-xs leading-5">
                    {JSON.stringify(scenarioPackage, null, 2)}
                  </pre>
                </ScrollArea>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
