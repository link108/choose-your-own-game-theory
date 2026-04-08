"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ScenarioData } from "./types";

export function ReviewLaunch({ scenario }: { scenario: ScenarioData }) {
  const router = useRouter();
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState("");

  // Validation
  const issues: string[] = [];
  const playerActors = scenario.actors.filter((a) => a.isPlayer);
  const nonPlayerActors = scenario.actors.filter((a) => !a.isPlayer);

  if (playerActors.length === 0) issues.push("No player character assigned");
  if (playerActors.length > 1) issues.push("Multiple player characters — only one is allowed");
  if (nonPlayerActors.length === 0) issues.push("At least one non-player actor is needed");
  if (!scenario.description.trim()) issues.push("Scenario description is empty");
  if (scenario.actors.some((a) => !a.name.trim())) issues.push("Some actors have no name");

  const canLaunch = issues.length === 0;

  // Collect all relationships
  const relationships = scenario.actors.flatMap((actor) =>
    actor.relationshipsFrom.map((rel) => ({
      ...rel,
      fromName: actor.name,
      toName: scenario.actors.find((a) => a.id === rel.toActorId)?.name ?? "?",
    }))
  );

  async function handleLaunch() {
    setLaunching(true);
    setError("");
    try {
      const res = await fetch(`/api/scenarios/${scenario.id}/sessions`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start game");
      }

      const session = await res.json();
      router.push(`/scenarios/${scenario.id}/play?session=${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game");
      setLaunching(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Validation */}
      {issues.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium mb-2">Fix these issues before launching:</p>
            <ul className="list-disc pl-4 space-y-1">
              {issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* World Overview */}
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

      {/* Actors */}
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
                      {(Array.isArray(actor.traits) ? actor.traits : []).map((trait: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {trait}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {actor.resources.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {actor.resources.map((r) => (
                        <span key={r.id}>
                          {r.name}: {r.value}
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

      {/* Relationships */}
      {relationships.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Relationships ({relationships.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {relationships.map((rel) => (
                <div
                  key={rel.id}
                  className="flex items-center gap-3 text-sm"
                >
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

      {/* World Variables */}
      {scenario.worldVariables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              World Variables ({scenario.worldVariables.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {scenario.worldVariables.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm">
                  <span>{v.name}</span>
                  <span className="text-muted-foreground">{v.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Launch */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <Button
        size="lg"
        onClick={handleLaunch}
        disabled={!canLaunch || launching}
        className="w-full"
      >
        {launching ? "Starting Game..." : "Start Game"}
      </Button>
    </div>
  );
}
