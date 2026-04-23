"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildScenarioLaunchReadiness,
  buildScenarioReviewScore,
  buildScenarioReviewSections,
  type ScenarioEditorTab,
} from "@/lib/scenario-review";
import type { ScenarioData } from "./types";

interface PackageReviewResult {
  valid: boolean;
  issues: Array<{
    severity: "error" | "warning";
    path: string;
    message: string;
  }>;
  diagnostics: Array<{
    severity: "warning";
    code: string;
    path: string;
    message: string;
    recommendation?: string;
  }>;
}

export function ReviewLaunch({
  scenario,
  onNavigateToTab,
}: {
  scenario: ScenarioData;
  onNavigateToTab?: (tab: ScenarioEditorTab) => void;
}) {
  const router = useRouter();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");
  const [packageReview, setPackageReview] = useState<PackageReviewResult | null>(null);
  const [packageReviewLoading, setPackageReviewLoading] = useState(false);
  const [packageReviewError, setPackageReviewError] = useState("");

  const relationships = useMemo(
    () =>
      scenario.actors.flatMap((actor) =>
        actor.relationshipsFrom.map((rel) => ({
          ...rel,
          fromName: actor.name,
          toName: scenario.actors.find((a) => a.id === rel.toActorId)?.name ?? "?",
        }))
      ),
    [scenario.actors]
  );

  const readiness = useMemo(
    () => buildScenarioLaunchReadiness(scenario, packageReview),
    [scenario, packageReview]
  );
  const reviewSections = useMemo(
    () => buildScenarioReviewSections(readiness),
    [readiness]
  );
  const reviewScore = useMemo(
    () => buildScenarioReviewScore(readiness),
    [readiness]
  );
  const hasScenarioPackage = scenario.scenarioPackage !== null;

  const loadPackageReview = useCallback(async () => {
    setPackageReviewLoading(true);
    setPackageReviewError("");

    try {
      const response = await fetch(`/api/scenarios/${scenario.id}/package/validate`);
      const data = (await response.json().catch(() => null)) as
        | PackageReviewResult
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          data && "error" in data
            ? data.error
            : "Failed to validate scenario package"
        );
      }

      setPackageReview((data as PackageReviewResult) ?? null);
    } catch (err) {
      setPackageReviewError(
        err instanceof Error ? err.message : "Failed to validate scenario package"
      );
      setPackageReview(null);
    } finally {
      setPackageReviewLoading(false);
    }
  }, [scenario.id]);

  useEffect(() => {
    void loadPackageReview();
  }, [loadPackageReview]);

  async function handleLaunch() {
    setLaunching(true);
    setError("");
    try {
      const res = await fetch(`/api/scenarios/${scenario.id}/sessions`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string; details?: string }
          | null;
        throw new Error(
          data?.error && data?.details
            ? `${data.error}: ${data.details}`
            : data?.error || "Failed to start game"
        );
      }

      const session = await res.json();
      router.push(`/scenarios/${scenario.id}/play?session=${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game");
      setLaunching(false);
    }
  }

  const readinessLabel = readiness.ready
    ? readiness.warnings.length > 0
      ? "Ready With Warnings"
      : "Ready To Launch"
    : "Not Ready";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Launch Readiness</CardTitle>
              <CardDescription>
                Review scenario blockers, package validation, and authoring warnings
                before starting a session.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadPackageReview()}
              disabled={packageReviewLoading}
            >
              {packageReviewLoading ? "Refreshing..." : "Refresh review"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={readiness.ready ? "default" : "destructive"}>
              {readinessLabel}
            </Badge>
            <Badge variant="outline">
              Score: {reviewScore.score}/100
            </Badge>
            <Badge variant="outline">{reviewScore.label}</Badge>
            <Badge variant="outline">
              Blockers: {readiness.blockers.length}
            </Badge>
            <Badge variant="outline">
              Warnings: {readiness.warnings.length}
            </Badge>
            <Badge variant={hasScenarioPackage ? "default" : "outline"}>
              {hasScenarioPackage ? "Scenario package attached" : "No package attached"}
            </Badge>
            {packageReview && (
              <Badge variant={packageReview.valid ? "outline" : "destructive"}>
                {packageReview.valid ? "Package valid" : "Package invalid"}
              </Badge>
            )}
          </div>

          {packageReviewError && (
            <Alert variant="destructive">
              <AlertTitle>Package review failed</AlertTitle>
              <AlertDescription>{packageReviewError}</AlertDescription>
            </Alert>
          )}

          {readiness.blockers.length > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>Launch blockers</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-1">
                  {readiness.blockers.map((issue, index) => (
                    <li key={`${issue.source}-${index}`}>{issue.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTitle>No launch blockers</AlertTitle>
              <AlertDescription>
                This scenario meets the current launch requirements.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Package Report</CardTitle>
          <CardDescription>
            Grouped review output for launch setup, package validity, runtime risks,
            and authoring quality.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          {reviewSections.map((section) => {
            const totalIssues = section.blockers.length + section.warnings.length;
            const clear = totalIssues === 0;

            return (
              <Card key={section.id} className="border-dashed">
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{section.title}</CardTitle>
                    <Badge
                      variant={section.blockers.length > 0 ? "destructive" : "outline"}
                    >
                      Blockers: {section.blockers.length}
                    </Badge>
                    <Badge variant="outline">
                      Warnings: {section.warnings.length}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => onNavigateToTab?.(section.suggestedTab)}
                    >
                      Open {section.suggestedTab}
                    </Button>
                  </div>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {clear ? (
                    <p className="text-sm text-muted-foreground">
                      No issues in this section.
                    </p>
                  ) : (
                    <>
                      {section.blockers.map((issue, index) => (
                        <Alert key={`blocker-${section.id}-${index}`} variant="destructive">
                          <AlertTitle>Blocker</AlertTitle>
                          <AlertDescription>{issue.message}</AlertDescription>
                        </Alert>
                      ))}
                      {section.warnings.map((issue, index) => (
                        <Alert key={`warning-${section.id}-${index}`}>
                          <AlertTitle>Warning</AlertTitle>
                          <AlertDescription>{issue.message}</AlertDescription>
                        </Alert>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>World Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">{scenario.description}</p>
          {scenario.worldDescription && (
            <p className="text-sm text-muted-foreground">
              {scenario.worldDescription}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actors ({scenario.actors.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {scenario.actors.map((actor) => (
              <Card key={actor.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">{actor.name}</CardTitle>
                    {actor.isPlayer && <Badge variant="default">Player</Badge>}
                  </div>
                  <CardDescription className="text-xs line-clamp-2">
                    {actor.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(Array.isArray(actor.traits) ? actor.traits : []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(actor.traits) ? actor.traits : []).map((trait, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {trait}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {actor.resources.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {actor.resources.map((resource) => (
                        <span key={resource.id}>
                          {resource.name}: {resource.value}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {relationships.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Relationships ({relationships.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {relationships.map((rel) => (
                <div key={rel.id} className="flex items-center gap-3 text-sm">
                  <span className="font-medium">{rel.fromName}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{rel.toName}</span>
                  <Badge variant="outline">{rel.type.replace("_", " ")}</Badge>
                  <span className="text-xs text-muted-foreground">
                    strength: {rel.strength}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {scenario.worldVariables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              World Variables ({scenario.worldVariables.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {scenario.worldVariables.map((variable) => (
                <div
                  key={variable.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{variable.name}</span>
                  <span className="text-muted-foreground">{variable.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        size="lg"
        onClick={handleLaunch}
        disabled={!readiness.ready || launching || packageReviewLoading}
        className="w-full"
      >
        {launching ? "Starting Game..." : "Start Game"}
      </Button>
    </div>
  );
}
