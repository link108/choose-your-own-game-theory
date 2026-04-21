"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { GameView } from "@/components/game/game-view";
import type { PageData, Choice, StructuredNarrative } from "@/lib/types";

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

export default function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [scenarioId, setScenarioId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<PageData | null>(null);
  const [turnHistory, setTurnHistory] = useState<TurnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");
  const [currentTurn, setCurrentTurn] = useState(0);

  // Resolve params
  useEffect(() => {
    params.then(({ id }) => setScenarioId(id));
  }, [params]);

  useEffect(() => {
    const sid = searchParams.get("session");
    if (sid) setSessionId(sid);
  }, [searchParams]);

  // Load game state
  const loadGame = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError("");

    try {
      // Load turn history
      const turnsRes = await fetch(`/api/sessions/${sessionId}/turns`);
      const turns: TurnRecord[] = await turnsRes.json();

      if (turns.length === 0) {
        // Generate initial page (turn 0)
        const initRes = await fetch(`/api/sessions/${sessionId}/turns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const initData = await initRes.json();
        setCurrentPage(initData.page);
        setTurnHistory([initData.turn]);
        setCurrentTurn(0);
      } else {
        setTurnHistory(turns);
        const lastTurn = turns[turns.length - 1];
        if (lastTurn.renderedPage) {
          // Parse narrative — stored as JSON string in DB
          let narrative: StructuredNarrative;
          try {
            narrative = typeof lastTurn.renderedPage.narrative === "string"
              ? JSON.parse(lastTurn.renderedPage.narrative)
              : lastTurn.renderedPage.narrative;
          } catch {
            // Legacy string narrative
            narrative = {
              playerAction: lastTurn.renderedPage.narrative,
              consequences: "",
              otherActions: [],
              worldUpdate: "",
            };
          }
          setCurrentPage({
            title: lastTurn.renderedPage.title,
            narrative,
            stateSummary: lastTurn.renderedPage.stateSummary as PageData["stateSummary"],
            choices: lastTurn.renderedPage.choices as unknown as Choice[],
          });
        }
        setCurrentTurn(lastTurn.turnNumber);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load game");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  async function handleChoice(choiceId: string) {
    if (resolving) return;
    setResolving(true);
    setError("");

    try {
      const res = await fetch(`/api/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choiceId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to resolve turn");
      }

      const data = await res.json();
      setCurrentPage(data.page);
      setTurnHistory((prev) => [...prev, data.turn]);
      setCurrentTurn(data.turn.turnNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Turn resolution failed");
    } finally {
      setResolving(false);
    }
  }

  async function regenerateChoices(suggestedAction?: string) {
    if (resolving) return;
    setResolving(true);
    setError("");

    try {
      const res = await fetch(`/api/sessions/${sessionId}/choices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          suggestedAction?.trim()
            ? { suggestedAction: suggestedAction.trim() }
            : {}
        ),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to regenerate choices");
      }

      const data = await res.json();
      setCurrentPage((prev) =>
        prev
          ? {
              ...prev,
              choices: data.choices as Choice[],
            }
          : prev
      );
      setTurnHistory((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = {
          ...last,
          renderedPage: last.renderedPage
            ? {
                ...last.renderedPage,
                choices: data.choices,
              }
            : last.renderedPage,
        };
        return next;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Choice regeneration failed"
      );
    } finally {
      setResolving(false);
    }
  }

  function handlePause() {
    router.push(`/scenarios/${scenarioId}`);
  }

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">No game session specified.</p>
      </div>
    );
  }

  return (
    <GameView
      currentPage={currentPage}
      turnHistory={turnHistory}
      currentTurn={currentTurn}
      loading={loading}
      resolving={resolving}
      error={error}
      onChoice={handleChoice}
      onRegenerateChoices={() => regenerateChoices()}
      onSuggestAction={(suggestedAction) => regenerateChoices(suggestedAction)}
      onPause={handlePause}
      onRetry={loadGame}
    />
  );
}
