"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NarrativePanel } from "./narrative-panel";
import { ChoicePanel } from "./choice-panel";
import { StateSummaryPanel } from "./state-summary-panel";
import { TurnHistoryPanel } from "./turn-history-panel";
import { DebugPanel } from "./debug-panel";
import { RuntimeStatusPanel } from "./runtime-status-panel";
import type { PageData, StateChange, ResolverDebug } from "@/lib/types";
import type { ChoiceGenerationTrace } from "@/lib/llm/game-llm";

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
  actorResponses: { actorId: string; action: string; reasoning: string }[];
  stateChanges: unknown;
  proposals?: unknown;
  resolverLog: unknown;
}

interface GameViewProps {
  currentPage: PageData | null;
  turnHistory: TurnRecord[];
  currentTurn: number;
  loading: boolean;
  resolving: boolean;
  regeneratingChoices: boolean;
  error: {
    message: string;
    details?: string;
    code?: string;
    retryable?: boolean;
    trace?: ChoiceGenerationTrace;
  } | null;
  onChoice: (choiceId: string) => void;
  onRegenerateChoices: () => void;
  onSuggestAction: (suggestedAction: string) => void;
  onPause: () => void;
  onRetry: () => void;
}

export function GameView({
  currentPage,
  turnHistory,
  currentTurn,
  loading,
  resolving,
  regeneratingChoices,
  error,
  onChoice,
  onRegenerateChoices,
  onSuggestAction,
  onPause,
  onRetry,
}: GameViewProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const latestResolverLog =
    turnHistory.length > 0
      ? ((turnHistory[turnHistory.length - 1].resolverLog as ResolverDebug) ?? null)
      : null;

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDebugOpen(!debugOpen)}
            className="font-mono text-yellow-600 dark:text-yellow-400 border-yellow-500/50"
          >
            Debug
          </Button>
          <Button variant="outline" size="sm" onClick={onPause}>
            Pause
          </Button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p>{error.message}</p>
              {(error.code || error.retryable != null) && (
                <p className="text-xs opacity-80">
                  {error.code ? `code: ${error.code}` : ""}
                  {error.code && error.retryable != null ? " · " : ""}
                  {error.retryable != null
                    ? `retryable: ${String(error.retryable)}`
                    : ""}
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Retry
            </Button>
          </div>
          {error.trace && <ChoiceGenerationTracePanel trace={error.trace} />}
        </div>
      )}

      <RuntimeStatusPanel resolverLog={latestResolverLog} />

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
            onRegenerate={onRegenerateChoices}
            onSuggestAction={onSuggestAction}
            disabled={resolving || regeneratingChoices}
            regenerating={regeneratingChoices}
          />
        </div>
      </div>

      {/* Debug panel — latest turn */}
      {debugOpen && turnHistory.length > 0 && (() => {
        const last = turnHistory[turnHistory.length - 1];
        return (
          <DebugPanel
            turnNumber={last.turnNumber}
            choices={currentPage.choices}
            actorResponses={last.actorResponses ?? []}
            stateChanges={(last.stateChanges as StateChange[]) ?? []}
            resolverLog={(last.resolverLog as ResolverDebug) ?? null}
          />
        );
      })()}

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

function ChoiceGenerationTracePanel({
  trace,
}: {
  trace: ChoiceGenerationTrace;
}) {
  return (
    <details className="rounded border border-destructive/20 bg-background/40 p-3">
      <summary className="cursor-pointer font-mono text-xs">
        Choice generation trace ({trace.attempts.length} attempts)
      </summary>
      <div className="mt-3 space-y-4">
        <p className="font-mono text-xs text-muted-foreground">
          minChoices={trace.minChoices} · previousChoiceCount={trace.previousChoiceCount}
          {" · "}
          excludedChoiceCount={trace.excludedChoiceCount}
          {trace.suggestedAction ? ` · suggestedAction="${trace.suggestedAction}"` : ""}
        </p>
        {trace.attempts.map((attempt) => (
          <div
            key={attempt.attempt}
            className="space-y-2 rounded border border-border/60 bg-background/60 p-3"
          >
            <p className="font-mono text-xs font-semibold">
              Attempt {attempt.attempt}
            </p>
            <div>
              <p className="font-mono text-xs text-muted-foreground">Prompt</p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-muted/60 p-2 text-[11px]">
                {JSON.stringify(attempt.prompt, null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-mono text-xs text-muted-foreground">Response</p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-muted/60 p-2 text-[11px]">
                {attempt.rawResponse ?? "(none)"}
              </pre>
            </div>
            <div>
              <p className="font-mono text-xs text-muted-foreground">Validation</p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-muted/60 p-2 text-[11px]">
                {JSON.stringify(
                  {
                    parsedChoices: attempt.parsedChoices ?? null,
                    validChoices: attempt.validChoices ?? [],
                    rejectedChoices: attempt.rejectedChoices ?? [],
                    error: attempt.error ?? null,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
