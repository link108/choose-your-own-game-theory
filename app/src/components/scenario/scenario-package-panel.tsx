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
import type { ActorData } from "./types";

interface ScenarioPackagePanelProps {
  scenarioId: string;
  scenarioPackage: unknown | null;
  actors: ActorData[];
}

interface ValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
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
  operationsJson: string;
}

interface ObjectTypeDraft {
  id: string;
  label: string;
  description: string;
  fieldsJson: string;
}

interface ObjectDraft {
  id: string;
  typeId: string;
  name: string;
  visibility: "visible" | "hidden" | "revealed";
  fieldsJson: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function ScenarioPackagePanel({
  scenarioId,
  scenarioPackage,
  actors,
}: ScenarioPackagePanelProps) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [minChoices, setMinChoices] = useState("3");
  const [maxChoices, setMaxChoices] = useState("5");
  const [guidance, setGuidance] = useState("");
  const [preferredEffectIds, setPreferredEffectIds] = useState("");
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
              fieldsJson: JSON.stringify(
                isRecord(item.fields) ? item.fields : {},
                null,
                2
              ),
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
              fieldsJson: JSON.stringify(
                isRecord(item.fields) ? item.fields : {},
                null,
                2
              ),
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
                operationsJson: JSON.stringify(
                  Array.isArray(rule.operations) ? rule.operations : [],
                  null,
                  2
                ),
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
        operationsJson: "[]",
      },
    ]);
  }

  function removeTriggerRuleDraft(index: number) {
    setTriggerRuleDrafts((current) =>
      current.filter((_, draftIndex) => draftIndex !== index)
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
        let operations: unknown;
        try {
          operations = JSON.parse(draft.operationsJson);
        } catch {
          throw new Error(`Trigger rule ${index + 1} has invalid operations JSON.`);
        }

        if (!Array.isArray(operations)) {
          throw new Error(`Trigger rule ${index + 1} operations must be a JSON array.`);
        }

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
          operations,
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
    value: string
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
        fieldsJson: "{}",
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
        let fields: unknown;
        try {
          fields = JSON.parse(draft.fieldsJson);
        } catch {
          throw new Error(`Object type ${index + 1} has invalid fields JSON.`);
        }

        if (!isRecord(fields)) {
          throw new Error(`Object type ${index + 1} fields must be a JSON object.`);
        }

        return {
          id: draft.id.trim(),
          label: draft.label.trim(),
          ...(draft.description.trim()
            ? { description: draft.description.trim() }
            : {}),
          fields,
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
    value: string
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
        fieldsJson: "{}",
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
        let fields: unknown;
        try {
          fields = JSON.parse(draft.fieldsJson);
        } catch {
          throw new Error(`Object ${index + 1} has invalid fields JSON.`);
        }

        if (!isRecord(fields)) {
          throw new Error(`Object ${index + 1} fields must be a JSON object.`);
        }

        return {
          id: draft.id.trim(),
          typeId: draft.typeId.trim(),
          name: draft.name.trim(),
          visibility: draft.visibility,
          fields,
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

  return (
    <div className="space-y-6">
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
            <Alert>
              <AlertDescription>
                No scenario package is attached yet. This scenario can still run
                through legacy/manual paths, but it will not use the new
                package-backed simulation flow.
              </AlertDescription>
            </Alert>
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
                      Define package-backed conditional rules. Use JSON only for
                      the operations array.
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

                        <div className="space-y-2">
                          <Label htmlFor={`trigger-operations-${index}`}>
                            Operations JSON
                          </Label>
                          <Textarea
                            id={`trigger-operations-${index}`}
                            rows={8}
                            value={draft.operationsJson}
                            onChange={(event) =>
                              updateTriggerRuleDraft(
                                index,
                                "operationsJson",
                                event.target.value
                              )
                            }
                            placeholder='[{"op":"setWorldVariable","variable":"world_season","value":"Winter"}]'
                          />
                        </div>
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
                      Define scenario object schemas. Use JSON for the field map.
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
                          <Label htmlFor={`object-type-fields-${index}`}>
                            Fields JSON
                          </Label>
                          <Textarea
                            id={`object-type-fields-${index}`}
                            rows={10}
                            value={draft.fieldsJson}
                            onChange={(event) =>
                              updateObjectTypeDraft(index, "fieldsJson", event.target.value)
                            }
                            placeholder='{"defense":{"kind":"number","min":0,"max":100}}'
                          />
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
                      Define scenario instances. Use JSON for instance field values.
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
                            <Input
                              id={`object-type-id-${index}`}
                              value={draft.typeId}
                              onChange={(event) =>
                                updateObjectDraft(index, "typeId", event.target.value)
                              }
                              placeholder="location"
                            />
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

                        <div className="space-y-2">
                          <Label htmlFor={`object-fields-${index}`}>
                            Fields JSON
                          </Label>
                          <Textarea
                            id={`object-fields-${index}`}
                            rows={8}
                            value={draft.fieldsJson}
                            onChange={(event) =>
                              updateObjectDraft(index, "fieldsJson", event.target.value)
                            }
                            placeholder='{"defense":30,"status":"open"}'
                          />
                        </div>
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

              {validation && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={validation.valid ? "default" : "destructive"}>
                      {validation.valid ? "Valid" : "Validation issues"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {validation.issues.length} issue
                      {validation.issues.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {validation.issues.length > 0 && (
                    <div className="space-y-2">
                      {validation.issues.map((issue, index) => (
                        <Alert
                          key={`${issue.path}-${index}`}
                          variant={
                            issue.severity === "error" ? "destructive" : "default"
                          }
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
              )}

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
