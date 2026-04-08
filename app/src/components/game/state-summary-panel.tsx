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
            playerResources.map((r) => {
              const pct = r.maxValue > 0 ? (r.value / r.maxValue) * 100 : 0;
              return (
                <div key={r.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{r.name}</span>
                    <span className="font-mono font-medium">
                      {r.value}
                      <span className="text-muted-foreground text-xs">/{r.maxValue}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct < 20 ? "bg-red-500" : pct < 50 ? "bg-yellow-500" : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                </div>
              );
            })
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
            {worldState.map((v, i) => {
              const numVal = parseFloat(v.value);
              const isNumeric = !isNaN(numVal) && (v.type === "number" || /^\d+(\.\d+)?$/.test(v.value));
              const maxVal = v.maxValue ? parseFloat(v.maxValue) : 0;
              const hasRange = isNumeric && maxVal > 0;
              const pct = hasRange ? (numVal / maxVal) * 100 : 0;

              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{v.name}</span>
                    <span>
                      {v.value}
                      {hasRange && <span className="text-muted-foreground">/{v.maxValue}</span>}
                    </span>
                  </div>
                  {hasRange && (
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          pct > 66 ? "bg-red-500" : pct > 33 ? "bg-yellow-500" : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
