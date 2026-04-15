"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { PageData, VisibleStateChange } from "@/lib/types";

interface StateSummaryPanelProps {
  stateSummary: PageData["stateSummary"];
}

const NUMERIC_WORLD_KINDS = new Set(["resource", "countdown", "counter"]);

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
                    <span className="flex items-baseline gap-1.5 font-mono font-medium">
                      <span>
                        {r.value}
                        <span className="text-muted-foreground text-xs">/{r.maxValue}</span>
                      </span>
                      <ChangeNote change={r.change} compact />
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
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {actor.relationship}
                    </Badge>
                    <ChangeNote
                      change={actor.changes?.find((change) => change.label === "Relationship")}
                      compact
                    />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span>{actor.status}</span>
                  <ChangeNote
                    change={actor.changes?.find((change) => change.label === "Status")}
                    inlineText
                  />
                </div>
                <ChangeNotes
                  changes={actor.changes?.filter(
                    (change) =>
                      change.label !== "Relationship" && change.label !== "Status"
                  )}
                />
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
              {activeTensions.map((tension, i) => {
                const item =
                  typeof tension === "string"
                    ? { text: tension, change: undefined }
                    : tension;
                return (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span>{item.text}</span>
                    <ChangeNote change={item.change} inlineText />
                  </li>
                );
              })}
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
              const isNumeric = !isNaN(numVal) && NUMERIC_WORLD_KINDS.has(v.kind);
              const maxVal = v.maxValue ? parseFloat(v.maxValue) : 0;
              const hasRange = isNumeric && maxVal > 0;
              const pct = hasRange ? (numVal / maxVal) * 100 : 0;

              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{v.name}</span>
                    <span className="flex items-baseline gap-1.5">
                      <span>
                        {v.value}
                        {hasRange && <span className="text-muted-foreground">/{v.maxValue}</span>}
                      </span>
                      <ChangeNote change={v.change} compact />
                    </span>
                  </div>
                  {v.change?.kind === "text" && <ChangeNote change={v.change} />}
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

function ChangeNotes({ changes }: { changes?: VisibleStateChange[] }) {
  if (!changes || changes.length === 0) return null;

  return (
    <div className="space-y-0.5 pt-1">
      {changes.map((change, index) => (
        <ChangeNote key={index} change={change} />
      ))}
    </div>
  );
}

function ChangeNote({
  change,
  compact = false,
  inlineText = false,
}: {
  change?: VisibleStateChange;
  compact?: boolean;
  inlineText?: boolean;
}) {
  if (!change) return null;

  const label = change.label ? `${change.label}: ` : "";

  if (change.kind === "numeric") {
    const delta = change.delta ?? Number(change.current) - Number(change.previous);
    const isPositive = delta > 0;
    const className = isPositive
      ? "text-green-600 dark:text-green-400"
      : delta < 0
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";

    const content = (
      <>
        {label}
        {isPositive ? "+" : ""}
        {delta}
      </>
    );

    if (compact || inlineText) {
      return <span className={`text-[11px] font-medium ${className}`}>{content}</span>;
    }

    return <p className={`text-[11px] font-medium ${className}`}>{content}</p>;
  }

  const text = (
    <>
      {label}
      {String(change.previous)} -&gt; {String(change.current)}
    </>
  );

  if (compact || inlineText) {
    return (
      <span className="ml-1 text-[11px] text-muted-foreground">
        {inlineText ? "(" : ""}
        {text}
        {inlineText ? ")" : ""}
      </span>
    );
  }

  return (
    <p className="text-[11px] text-muted-foreground">
      {text}
    </p>
  );
}
