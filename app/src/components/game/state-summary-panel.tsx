"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PageData } from "@/lib/types";

interface StateSummaryPanelProps {
  stateSummary: PageData["stateSummary"];
}

export function StateSummaryPanel({ stateSummary }: StateSummaryPanelProps) {
  const { playerResources, keyActors, activeTensions, worldState } =
    stateSummary;

  return (
    <div className="space-y-3">
      {/* Resources */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Your Resources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {playerResources.length > 0 ? (
            playerResources.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-sm"
              >
                <span>{r.name}</span>
                <span className="font-mono font-medium">{r.value}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No resources</p>
          )}
        </CardContent>
      </Card>

      {/* Key Actors */}
      {keyActors.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Key Actors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {keyActors.map((actor, i) => (
              <div key={i}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{actor.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {actor.relationship}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{actor.status}</p>
                {i < keyActors.length - 1 && <Separator className="mt-2" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Active Tensions */}
      {activeTensions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tensions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {activeTensions.map((tension, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {tension}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* World State */}
      {worldState.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">World</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {worldState.map((v, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground">{v.name}</span>
                <span>{v.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
