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
  renderedPage: {
    title: string;
    narrative: string;
    stateSummary: unknown;
    choices: unknown;
  } | null;
}

interface TurnHistoryPanelProps {
  turns: TurnRecord[];
  onClose: () => void;
}

export function TurnHistoryPanel({ turns, onClose }: TurnHistoryPanelProps) {
  const [expandedTurn, setExpandedTurn] = useState<number | null>(null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Turn History</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
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
                      {turn.renderedPage.narrative}
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
