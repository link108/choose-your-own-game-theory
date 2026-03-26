"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { GameView } from "@/components/game/game-view";
import type { PageData, Choice } from "@/lib/types";

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
          setCurrentPage({
            title: lastTurn.renderedPage.title,
            narrative: lastTurn.renderedPage.narrative,
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
      onPause={handlePause}
      onRetry={loadGame}
    />
  );
}
