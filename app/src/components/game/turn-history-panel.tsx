"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TurnRecord {
  turnNumber: number;
  playerChoiceText: string | null;
  events?: unknown;
  renderedPage: {
    title: string;
    narrative: string;
    stateSummary: unknown;
    choices: unknown;
  } | null;
  actorResponses?: { actorId: string; action: string; reasoning: string }[];
  stateChanges?: unknown;
  proposals?: unknown;
  resolverLog?: unknown;
}

interface TurnHistoryPanelProps {
  turns: TurnRecord[];
  onClose: () => void;
}

export function TurnHistoryPanel({ turns, onClose }: TurnHistoryPanelProps) {
  const [expandedTurn, setExpandedTurn] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  async function copyHistory() {
    const payload = formatHistoryForDebug(turns);

    try {
      await copyText(payload);
      setCopyStatus("copied");
    } catch (error) {
      console.error("Failed to copy turn history:", error);
      setCopyStatus("failed");
    }

    window.setTimeout(() => setCopyStatus("idle"), 1800);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Turn History</CardTitle>
          <div className="flex items-center gap-2">
            {copyStatus !== "idle" && (
              <span
                className={
                  copyStatus === "copied"
                    ? "text-xs text-green-600 dark:text-green-400"
                    : "text-xs text-destructive"
                }
              >
                {copyStatus === "copied" ? "Copied" : "Copy failed"}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={copyHistory}
              disabled={turns.length === 0}
            >
              Copy debug history
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {turns.map((turn) => (
            <div
              key={turn.turnNumber}
              className="border rounded-lg p-3 cursor-pointer hover:bg-accent transition-colors"
              onClick={() =>
                setExpandedTurn(
                  expandedTurn === turn.turnNumber ? null : turn.turnNumber
                )
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Turn {turn.turnNumber}
                  {turn.renderedPage
                    ? ` — ${turn.renderedPage.title}`
                    : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {expandedTurn === turn.turnNumber ? "−" : "+"}
                </span>
              </div>
              {turn.playerChoiceText && (
                <p className="text-xs text-muted-foreground mt-1">
                  Chose: {turn.playerChoiceText}
                </p>
              )}
              {expandedTurn === turn.turnNumber &&
                turn.renderedPage?.narrative && (
                  <div className="mt-3 pt-3 border-t prose prose-xs dark:prose-invert max-w-none">
                    <ReactMarkdown>
                      {(() => {
                        const n = turn.renderedPage.narrative;
                        if (typeof n === "object" && n !== null) {
                          const s = n as { playerAction?: string; consequences?: string };
                          return [s.playerAction, s.consequences].filter(Boolean).join("\n\n");
                        }
                        // Try parsing JSON string
                        try {
                          const parsed = JSON.parse(n as string);
                          return [parsed.playerAction, parsed.consequences].filter(Boolean).join("\n\n");
                        } catch {
                          return String(n);
                        }
                      })()}
                    </ReactMarkdown>
                  </div>
                )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard API unavailable");
  }
}

function formatHistoryForDebug(turns: TurnRecord[]) {
  const lines = [
    "# Turn History Debug Export",
    "",
    `Exported at: ${new Date().toISOString()}`,
    `Turn count: ${turns.length}`,
    "",
  ];

  for (const turn of turns) {
    const narrative = parseNarrative(turn.renderedPage?.narrative);

    lines.push(`## Turn ${turn.turnNumber}`);
    lines.push("");
    lines.push(`Title: ${turn.renderedPage?.title ?? "(no rendered page)"}`);
    lines.push(
      `Player action: ${turn.playerChoiceText ?? "(initial page / no selected action)"}`
    );
    lines.push("");

    lines.push("### Narrative");
    lines.push(`Player action text: ${narrative.playerAction || "(none)"}`);
    lines.push("");
    lines.push("Consequences:");
    lines.push(narrative.consequences || "(none)");
    lines.push("");
    lines.push("Other actions:");
    lines.push(formatOtherActions(narrative.otherActions));
    lines.push("");
    lines.push("World update:");
    lines.push(narrative.worldUpdate || "(none)");
    lines.push("");

    lines.push("### Choices Offered After Turn");
    lines.push(formatChoices(turn.renderedPage?.choices));
    lines.push("");

    lines.push("### State Summary");
    lines.push(formatJsonBlock(turn.renderedPage?.stateSummary ?? null));
    lines.push("");

    lines.push("### Debug");
    lines.push("Actor responses:");
    lines.push(formatJsonBlock(turn.actorResponses ?? []));
    lines.push("");
    lines.push("State changes:");
    lines.push(formatJsonBlock(turn.stateChanges ?? []));
    lines.push("");
    lines.push("Events:");
    lines.push(formatJsonBlock(turn.events ?? []));
    lines.push("");
    lines.push("Resolver log:");
    lines.push(formatJsonBlock(turn.resolverLog ?? null));
    lines.push("");
    lines.push("Raw proposals:");
    lines.push(formatJsonBlock(turn.proposals ?? null));
    lines.push("");
  }

  return lines.join("\n");
}

function parseNarrative(value: unknown) {
  const fallback = {
    playerAction: "",
    consequences: "",
    otherActions: [] as Array<{ actor?: string; description?: string; order?: number }>,
    worldUpdate: "",
  };

  const parsed = parseMaybeJson(value);
  if (!isRecord(parsed)) {
    return { ...fallback, playerAction: parsed == null ? "" : String(parsed) };
  }

  return {
    playerAction: getString(parsed.playerAction),
    consequences: getString(parsed.consequences),
    otherActions: Array.isArray(parsed.otherActions)
      ? parsed.otherActions.filter(isRecord)
      : [],
    worldUpdate: getString(parsed.worldUpdate),
  };
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatOtherActions(
  otherActions: Array<{ actor?: string; description?: string; order?: number }>
) {
  if (otherActions.length === 0) return "(none)";

  return otherActions
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((action) => {
      const actor = action.actor ? `${action.actor}: ` : "";
      return `- ${actor}${action.description ?? ""}`;
    })
    .join("\n");
}

function formatChoices(value: unknown) {
  const parsed = parseMaybeJson(value);
  if (!Array.isArray(parsed) || parsed.length === 0) return "(none)";

  return parsed
    .map((choice, index) => {
      if (!isRecord(choice)) return `${index + 1}. ${String(choice)}`;

      const id = getString(choice.id);
      const text = getString(choice.text);
      const description = getString(choice.description);
      const suffix = description ? ` - ${description}` : "";
      return `${index + 1}. ${id ? `[${id}] ` : ""}${text}${suffix}`;
    })
    .join("\n");
}

function formatJsonBlock(value: unknown) {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
