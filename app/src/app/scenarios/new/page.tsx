"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { ScenarioCreationShell } from "@/components/scenario/scenario-creation-shell";
import type { ScenarioPackageDiagnostic } from "@/lib/scenario-dsl";
import type {
  ScenarioBuilderAnswer,
  ScenarioBuilderDraft,
  ScenarioBuilderRequirementsAnalysis,
  ScenarioBuilderSection,
} from "@/lib/scenario-builder/schema";

interface ScenarioBuilderIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

interface ScenarioBuilderResult {
  draft: ScenarioBuilderDraft | null;
  validation: {
    valid: boolean;
    issues: ScenarioBuilderIssue[];
    diagnostics: ScenarioPackageDiagnostic[];
  };
  critique: string[];
}

interface ScenarioRequirementsResult {
  analysis: ScenarioBuilderRequirementsAnalysis;
}

const REGENERATABLE_SECTIONS: Array<{
  id: ScenarioBuilderSection;
  label: string;
}> = [
  { id: "actors", label: "Actors" },
  { id: "relationships", label: "Relationships" },
  { id: "worldVariables", label: "World Variables" },
  { id: "scenarioPackage", label: "Package" },
];

export default function NewScenarioPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [requirements, setRequirements] =
    useState<ScenarioBuilderRequirementsAnalysis | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draftResult, setDraftResult] = useState<ScenarioBuilderResult | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [refinementPrompt, setRefinementPrompt] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [error, setError] = useState("");

  function resetBuilderState() {
    setRequirements(null);
    setAnswers({});
    setDraftResult(null);
    setDraftDirty(false);
    setRefinementPrompt("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const worldDescription = formData.get("worldDescription") as string;

    if (!name.trim()) {
      setError("Scenario name is required");
      setSaving(false);
      return;
    }

    if (!description.trim()) {
      setError("Description is required");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, worldDescription }),
      });

      const data = (await response.json().catch(() => null)) as
        | { id?: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to create scenario");
      }

      router.push(`/scenarios/${data?.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create scenario");
      setSaving(false);
    }
  }

  function getAnswerPayload(): ScenarioBuilderAnswer[] {
    if (!requirements) return [];

    return requirements.questions
      .map((question) => ({
        id: question.id,
        answer: answers[question.id]?.trim() ?? "",
      }))
      .filter((answer) => answer.answer);
  }

  function hasUnansweredQuestions() {
    return Boolean(
      requirements &&
        requirements.questions.length > 0 &&
        requirements.questions.some((question) => !answers[question.id]?.trim())
    );
  }

  async function analyzeRequirements() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Enter a scenario concept before analyzing requirements.");
      return null;
    }

    setLoadingAction("analyzing");
    setError("");

    try {
      const response = await fetch("/api/scenarios/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      const data = (await response.json().catch(() => null)) as
        | ScenarioRequirementsResult
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data && "error" in data
            ? data.error
            : "Failed to analyze scenario requirements"
        );
      }

      const result = data as ScenarioRequirementsResult;
      setRequirements(result.analysis);
      return result.analysis;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to analyze scenario requirements"
      );
      return null;
    } finally {
      setLoadingAction("");
    }
  }

  async function generateDraft() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("Enter a scenario concept before generating a draft.");
      return;
    }

    let currentRequirements = requirements;
    if (!currentRequirements) {
      currentRequirements = await analyzeRequirements();
      if (!currentRequirements) return;
      if (currentRequirements.questions.length > 0) return;
    }

    if (hasUnansweredQuestions()) {
      setError("Answer the missing requirements before generating the draft.");
      return;
    }

    setLoadingAction("generating");
    setError("");

    try {
      const response = await fetch("/api/scenarios/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          answers: getAnswerPayload(),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | ScenarioBuilderResult
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data && "error" in data ? data.error : "Failed to generate scenario draft"
        );
      }

      setDraftResult((data as ScenarioBuilderResult) ?? null);
      setDraftDirty(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate scenario draft"
      );
    } finally {
      setLoadingAction("");
    }
  }

  async function revalidateDraft(nextDraft?: ScenarioBuilderDraft) {
    const draft = nextDraft ?? draftResult?.draft;
    if (!draft) return;

    setLoadingAction("validating");
    setError("");

    try {
      const response = await fetch("/api/scenarios/draft/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });

      const data = (await response.json().catch(() => null)) as
        | ScenarioBuilderResult
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data && "error" in data ? data.error : "Failed to validate scenario draft"
        );
      }

      setDraftResult((data as ScenarioBuilderResult) ?? null);
      setDraftDirty(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to validate scenario draft"
      );
    } finally {
      setLoadingAction("");
    }
  }

  async function regenerateSection(section: ScenarioBuilderSection) {
    if (!draftResult?.draft) return;

    setLoadingAction(`regenerating-${section}`);
    setError("");

    try {
      const response = await fetch("/api/scenarios/draft/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          draft: draftResult.draft,
          section,
          refinementPrompt: refinementPrompt.trim() || undefined,
          answers: getAnswerPayload(),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | ScenarioBuilderResult
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data && "error" in data ? data.error : "Failed to regenerate section"
        );
      }

      setDraftResult((data as ScenarioBuilderResult) ?? null);
      setDraftDirty(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to regenerate section"
      );
    } finally {
      setLoadingAction("");
    }
  }

  async function createFromDraft() {
    if (!draftResult?.draft || !draftResult.validation.valid || draftDirty) return;

    setLoadingAction("creating");
    setError("");

    try {
      const response = await fetch("/api/scenarios/from-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: draftResult.draft }),
      });

      const data = (await response.json().catch(() => null)) as
        | { id: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data?.error || "Failed to create scenario from generated draft"
        );
      }

      router.push(`/scenarios/${data?.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create scenario from generated draft"
      );
    } finally {
      setLoadingAction("");
    }
  }

  function updateDraft(updater: (draft: ScenarioBuilderDraft) => ScenarioBuilderDraft) {
    setDraftResult((current) => {
      if (!current?.draft) return current;
      return {
        ...current,
        draft: updater(current.draft),
      };
    });
    setDraftDirty(true);
  }

  const draft = draftResult?.draft;
  const issues = draftResult?.validation.issues ?? [];
  const diagnostics = draftResult?.validation.diagnostics ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ScenarioCreationShell />

      <Card>
        <CardHeader>
          <CardTitle>Scenario Builder</CardTitle>
          <CardDescription>
            Start with a rough concept. The builder can ask for missing details,
            generate a full draft, regenerate weak sections, and let you make
            lightweight edits before creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scenario-builder-prompt">Scenario concept</Label>
            <Textarea
              id="scenario-builder-prompt"
              rows={8}
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setError("");
              }}
              placeholder="Example: A tense mountain-border crisis where the player commands a small republic trying to survive pressure from two rival empires. I want diplomacy, supply shortages, and weather pressure to matter."
            />
            <p className="text-xs text-muted-foreground">
              The builder will gather missing requirements, then draft the scenario
              shell, actors, relationships, world variables, and package.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => void analyzeRequirements()}
              disabled={loadingAction !== ""}
              variant="outline"
            >
              {loadingAction === "analyzing"
                ? "Analyzing..."
                : "Analyze Requirements"}
            </Button>
            <Button onClick={() => void generateDraft()} disabled={loadingAction !== ""}>
              {loadingAction === "generating"
                ? "Generating..."
                : "Generate Scenario Draft"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={resetBuilderState}
              disabled={
                loadingAction !== "" &&
                loadingAction !== "analyzing" &&
                loadingAction !== "generating"
              }
            >
              Reset Builder
            </Button>
            <Link
              href="/scenarios"
              className="inline-flex h-10 items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium"
            >
              Cancel
            </Link>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {requirements && (
        <Card>
          <CardHeader>
            <CardTitle>Missing Requirements</CardTitle>
            <CardDescription>
              Answer only the gaps that materially affect the simulation draft.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {requirements.summary && (
              <p className="text-sm text-muted-foreground">{requirements.summary}</p>
            )}

            {requirements.questions.length === 0 ? (
              <Alert>
                <AlertDescription>
                  The prompt already provides enough information for a first draft.
                </AlertDescription>
              </Alert>
            ) : (
              requirements.questions.map((question) => (
                <div key={question.id} className="space-y-2 rounded-md border p-4">
                  <div>
                    <p className="font-medium">{question.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {question.question}
                    </p>
                    {question.rationale && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {question.rationale}
                      </p>
                    )}
                  </div>
                  <Textarea
                    rows={3}
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                    placeholder="Optional, but recommended if the builder asked for it."
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {draftResult && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Draft Review</CardTitle>
                  <CardDescription>
                    Generated drafts stay review-only until you create the scenario.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void revalidateDraft()}
                    disabled={!draft || loadingAction !== ""}
                  >
                    {loadingAction === "validating"
                      ? "Validating..."
                      : "Revalidate Draft"}
                  </Button>
                  <Button
                    onClick={() => void createFromDraft()}
                    disabled={
                      !draft ||
                      !draftResult.validation.valid ||
                      draftDirty ||
                      loadingAction !== ""
                    }
                  >
                    {loadingAction === "creating"
                      ? "Creating..."
                      : "Create Scenario"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  Creating the scenario persists this draft and then hands you off to
                  the normal editor for detailed changes.
                </AlertDescription>
              </Alert>

              {draftDirty && (
                <Alert>
                  <AlertDescription>
                    The draft has local inline edits that have not been revalidated yet.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={draftResult.validation.valid ? "default" : "destructive"}
                >
                  {draftResult.validation.valid ? "Draft valid" : "Validation issues"}
                </Badge>
                <Badge variant="outline">
                  {issues.length} issue{issues.length === 1 ? "" : "s"}
                </Badge>
                <Badge variant="outline">
                  {diagnostics.length} diagnostic{diagnostics.length === 1 ? "" : "s"}
                </Badge>
              </div>

              {draftResult.critique.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Critique</p>
                  <div className="space-y-2">
                    {draftResult.critique.map((item, index) => (
                      <p
                        key={`${item}-${index}`}
                        className="text-sm text-muted-foreground"
                      >
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {issues.length > 0 && (
                <div className="space-y-2">
                  {issues.map((issue, index) => (
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

              {diagnostics.length > 0 && (
                <div className="space-y-2">
                  {diagnostics.map((diagnostic, index) => (
                    <Alert key={`${diagnostic.code}-${index}`}>
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
            </CardContent>
          </Card>

          {draft && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Refine Sections</CardTitle>
                  <CardDescription>
                    Regenerate a single section while keeping the rest of the draft
                    intact. Shell section regeneration also refreshes the package.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="refinement-prompt">Refinement prompt</Label>
                    <Textarea
                      id="refinement-prompt"
                      rows={4}
                      value={refinementPrompt}
                      onChange={(event) => setRefinementPrompt(event.target.value)}
                      placeholder="Example: Make the rival actor more politically sophisticated and add a second support actor for the player."
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {REGENERATABLE_SECTIONS.map((section) => (
                      <Button
                        key={section.id}
                        variant="outline"
                        onClick={() => void regenerateSection(section.id)}
                        disabled={loadingAction !== ""}
                      >
                        {loadingAction === `regenerating-${section.id}`
                          ? `Regenerating ${section.label}...`
                          : `Regenerate ${section.label}`}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Scenario Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={draft.name}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      rows={3}
                      value={draft.description}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>World Description</Label>
                    <Textarea
                      rows={5}
                      value={draft.worldDescription}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          worldDescription: event.target.value,
                        }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Actors</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {draft.actors.map((actor) => (
                    <div key={actor.id} className="space-y-3 rounded-md border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-medium text-muted-foreground">
                          {actor.id}
                        </p>
                        <Button
                          size="sm"
                          variant={actor.isPlayer ? "default" : "outline"}
                          onClick={() =>
                            updateDraft((current) => ({
                              ...current,
                              actors: current.actors.map((candidate) => ({
                                ...candidate,
                                isPlayer: candidate.id === actor.id,
                              })),
                            }))
                          }
                        >
                          {actor.isPlayer ? "Player Actor" : "Set As Player"}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={actor.name}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              actors: current.actors.map((candidate) =>
                                candidate.id === actor.id
                                  ? { ...candidate, name: event.target.value }
                                  : candidate
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          rows={3}
                          value={actor.description}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              actors: current.actors.map((candidate) =>
                                candidate.id === actor.id
                                  ? { ...candidate, description: event.target.value }
                                  : candidate
                              ),
                            }))
                          }
                        />
                      </div>
                      {actor.goals.length > 0 && (
                        <p className="text-sm">Goals: {actor.goals.join(", ")}</p>
                      )}
                      {actor.traits.length > 0 && (
                        <p className="text-sm">Traits: {actor.traits.join(", ")}</p>
                      )}
                      {actor.resources.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {actor.resources.map((resource) => (
                            <Badge key={resource.id} variant="outline">
                              {resource.name}: {resource.value}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>World Variables</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {draft.worldVariables.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No world variables were generated.
                    </p>
                  ) : (
                    draft.worldVariables.map((variable) => (
                      <div key={variable.id} className="space-y-3 rounded-md border p-4">
                        <p className="text-sm font-medium text-muted-foreground">
                          {variable.id}
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Name</Label>
                            <Input
                              value={variable.name}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  worldVariables: current.worldVariables.map(
                                    (candidate) =>
                                      candidate.id === variable.id
                                        ? { ...candidate, name: event.target.value }
                                        : candidate
                                  ),
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Value</Label>
                            <Input
                              value={variable.value}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  worldVariables: current.worldVariables.map(
                                    (candidate) =>
                                      candidate.id === variable.id
                                        ? { ...candidate, value: event.target.value }
                                        : candidate
                                  ),
                                }))
                              }
                            />
                          </div>
                        </div>
                        <Badge variant="outline">{variable.kind}</Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Relationships</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {draft.relationships.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No relationships were generated.
                    </p>
                  ) : (
                    draft.relationships.map((relationship) => {
                      const fromActor = draft.actors.find(
                        (actor) => actor.id === relationship.fromActorId
                      );
                      const toActor = draft.actors.find(
                        (actor) => actor.id === relationship.toActorId
                      );

                      return (
                        <div
                          key={relationship.id}
                          className="space-y-3 rounded-md border p-4"
                        >
                          <p className="text-sm font-medium text-muted-foreground">
                            {relationship.id} · {fromActor?.name ?? relationship.fromActorId} →{" "}
                            {toActor?.name ?? relationship.toActorId}
                          </p>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Type</Label>
                              <Input
                                value={relationship.type}
                                onChange={(event) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    relationships: current.relationships.map(
                                      (candidate) =>
                                        candidate.id === relationship.id
                                          ? { ...candidate, type: event.target.value }
                                          : candidate
                                    ),
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Strength</Label>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={String(relationship.strength)}
                                onChange={(event) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    relationships: current.relationships.map(
                                      (candidate) =>
                                        candidate.id === relationship.id
                                          ? {
                                              ...candidate,
                                              strength: Number.parseInt(
                                                event.target.value || "0",
                                                10
                                              ),
                                            }
                                          : candidate
                                    ),
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                              rows={3}
                              value={relationship.description ?? ""}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  relationships: current.relationships.map(
                                    (candidate) =>
                                      candidate.id === relationship.id
                                        ? {
                                            ...candidate,
                                            description: event.target.value || null,
                                          }
                                        : candidate
                                  ),
                                }))
                              }
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Generated Package JSON</CardTitle>
                  <CardDescription>
                    Package edits stay in the existing Package tab after creation, but
                    you can also regenerate the package from the card above.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96 rounded-md border bg-muted/20">
                    <pre className="p-4 text-xs leading-5">
                      {JSON.stringify(draft.scenarioPackage, null, 2)}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Manual Create</CardTitle>
          <CardDescription>
            Skip the builder and create a blank scenario shell, then edit actors,
            relationships, and package details manually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Scenario Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. The Silk Road Standoff"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Brief overview of the scenario — what's at stake, who's involved..."
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="worldDescription">World Description</Label>
              <Textarea
                id="worldDescription"
                name="worldDescription"
                placeholder="Describe the setting — era, geography, political situation, key tensions..."
                rows={5}
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={saving || loadingAction !== ""}>
                {saving ? "Creating..." : "Create Scenario Manually"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
