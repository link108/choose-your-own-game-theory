"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NarrativePanel } from "./narrative-panel";
import { ChoicePanel } from "./choice-panel";
import { StateSummaryPanel } from "./state-summary-panel";
import { TurnHistoryPanel } from "./turn-history-panel";
import type { PageData } from "@/lib/types";

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

interface GameViewProps {
  currentPage: PageData | null;
  turnHistory: TurnRecord[];
  currentTurn: number;
  loading: boolean;
  resolving: boolean;
  error: string;
  onChoice: (choiceId: string) => void;
  onPause: () => void;
  onRetry: () => void;
}

export function GameView({
  currentPage,
  turnHistory,
  currentTurn,
  loading,
  resolving,
  error,
  onChoice,
  onPause,
  onRetry,
}: GameViewProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="animate-pulse text-2xl">Loading game...</div>
          <p className="text-muted-foreground text-sm">Preparing the scenario</p>
        </div>
      </div>
    );
  }

  if (!currentPage) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Failed to load game page.</p>
          <Button onClick={onRetry}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{currentPage.title}</h1>
          <p className="text-sm text-muted-foreground">Turn {currentTurn}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            History ({turnHistory.length})
          </Button>
          <Button variant="outline" size="sm" onClick={onPause}>
            Pause
          </Button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* State Summary — sidebar on desktop, top on mobile */}
        <div className="order-2 lg:order-1">
          <StateSummaryPanel stateSummary={currentPage.stateSummary} />
        </div>

        {/* Narrative + Choices — main content */}
        <div className="order-1 lg:order-2 space-y-4">
          <NarrativePanel
            narrative={currentPage.narrative}
            resolving={resolving}
          />
          <ChoicePanel
            choices={currentPage.choices}
            onChoice={onChoice}
            disabled={resolving}
          />
        </div>
      </div>

      {/* Turn History — collapsible bottom panel */}
      {historyOpen && (
        <TurnHistoryPanel
          turns={turnHistory}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}
