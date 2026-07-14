import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, PlaythroughDetail, Turn } from "../api";

function chosenText(turn: Turn): string {
  const opt = turn.player_view.options.find((o) => o.id === turn.chosen_option_id);
  return opt ? opt.text : "";
}

export default function Play() {
  const { id } = useParams();
  const [pt, setPt] = useState<PlaythroughDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [rejection, setRejection] = useState("");
  // null = follow the latest step; a number = the player stepped back through the log
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getPlaythrough(id)
      .then(setPt)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!pt || pt.status !== "active") return;
    const last = pt.turns.length - 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") setViewIndex((v) => Math.max(0, (v ?? last) - 1));
      if (e.key === "ArrowRight")
        setViewIndex((v) => (v === null || v + 1 >= last ? null : v + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pt]);

  if (error && !pt) return <div className="error">{error}</div>;
  if (!pt) return <p className="spinner">Loading…</p>;

  const turns = pt.turns;
  const latestIndex = turns.length - 1;
  const shownIndex = viewIndex === null ? latestIndex : Math.min(viewIndex, latestIndex);
  const turn = turns[shownIndex];
  const onLatest = shownIndex === latestIndex;
  const finished = pt.status !== "active";

  const refresh = async () => {
    setPt(await api.getPlaythrough(pt.id));
    setViewIndex(null);
  };

  const choose = async (optionId: string) => {
    setBusy(true);
    setError("");
    try {
      await api.choose(pt.id, optionId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const suggest = async () => {
    const text = suggestion.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    setRejection("");
    try {
      const result = await api.suggestAction(pt.id, text);
      if (result.accepted) {
        setSuggestion("");
        await refresh();
      } else {
        setRejection(result.reason);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async () => {
    setBusy(true);
    setError("");
    try {
      await api.regenerate(pt.id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const abandon = async () => {
    if (!confirm("Abandon this playthrough?")) return;
    await api.abandon(pt.id);
    await refresh();
  };

  const header = (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{pt.scenario_title}</h1>
        <span className={`badge ${pt.status}`}>{pt.status}</span>
      </div>
      <p className="muted">
        Playing as <strong>{pt.role_name}</strong> ·{" "}
        <Link to={`/scenarios/${pt.scenario_id}`}>back to scenario</Link>
      </p>
    </>
  );

  if (finished) {
    const epilogue = turns[latestIndex]?.player_view.epilogue;
    return (
      <div>
        {header}
        <div className="card">
          <h2>{pt.status === "completed" ? "The story is over" : "Playthrough abandoned"}</h2>
          {epilogue && (
            <>
              <p className="narrative">{epilogue}</p>
              <hr />
            </>
          )}
          <div className="row">
            <Link className="btn btn-primary" to={`/review/${pt.id}`}>
              Behind the curtain
            </Link>
            <Link className="btn" to={`/scenarios/${pt.scenario_id}`}>
              Back to scenario
            </Link>
          </div>
          <p className="muted" style={{ marginTop: "0.6rem" }}>
            Behind the curtain reveals the hidden game-master state and lets you get an
            analysis of your choices.
          </p>
        </div>

        <h2>The full story</h2>
        {turns.map((t) => (
          <div className="card" key={t.index}>
            <p className="muted">Step {t.index + 1}</p>
            <p className="narrative">{t.player_view.narrative}</p>
            {t.chosen_option_id && (
              <p>
                <span className="muted">You chose:</span> <em>{chosenText(t)}</em>
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {header}

      <div className="row step-nav">
        <button
          className="btn"
          aria-label="Previous step"
          disabled={shownIndex === 0}
          onClick={() => setViewIndex(shownIndex - 1)}
        >
          ←
        </button>
        <span className="muted">
          Step {shownIndex + 1} of {turns.length}
        </span>
        <button
          className="btn"
          aria-label="Next step"
          disabled={onLatest}
          onClick={() => setViewIndex(shownIndex + 1 >= latestIndex ? null : shownIndex + 1)}
        >
          →
        </button>
      </div>

      <div className={`card ${onLatest ? "" : "turn-past"}`}>
        <p className="narrative">{turn.player_view.narrative}</p>
        {turn.player_view.visible_state_summary && (
          <p className="muted">{turn.player_view.visible_state_summary}</p>
        )}

        {onLatest ? (
          <>
            <hr />
            <h2>What do you do?</h2>
            {turn.player_view.options.map((opt) => (
              <div className="option-wrap" key={opt.id}>
                <button className="option-btn" disabled={busy} onClick={() => choose(opt.id)}>
                  {opt.text}
                  {opt.custom && (
                    <span className="badge" style={{ marginLeft: "0.6rem" }}>
                      your idea
                    </span>
                  )}
                </button>
                {opt.reasoning && (
                  <details className="option-why">
                    <summary>Why consider this?</summary>
                    <p>{opt.reasoning}</p>
                  </details>
                )}
              </div>
            ))}

            <div className="suggest-box">
              <span className="muted">Or suggest your own action:</span>
              <div className="row">
                <input
                  value={suggestion}
                  placeholder="e.g. Take Morgan out for coffee and ask what's wrong"
                  disabled={busy}
                  onChange={(e) => {
                    setSuggestion(e.target.value);
                    setRejection("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") suggest();
                  }}
                />
                <button className="btn" disabled={busy || !suggestion.trim()} onClick={suggest}>
                  Suggest
                </button>
              </div>
              {rejection && (
                <p className="rejection">The GM rejected that action: {rejection}</p>
              )}
            </div>

            {busy && <p className="spinner">The world reacts…</p>}
            {error && <div className="error">{error}</div>}
            <div className="row" style={{ marginTop: "0.8rem" }}>
              <button className="btn" onClick={regenerate} disabled={busy}>
                Regenerate this turn
              </button>
              <button className="btn btn-danger" onClick={abandon} disabled={busy}>
                Abandon
              </button>
            </div>
          </>
        ) : (
          <>
            <hr />
            <p className="muted">You chose:</p>
            {turn.player_view.options.map((opt) => (
              <div
                key={opt.id}
                className={`option-btn ${opt.id === turn.chosen_option_id ? "chosen" : ""}`}
                style={{
                  cursor: "default",
                  opacity: opt.id === turn.chosen_option_id ? 1 : 0.5,
                }}
              >
                {opt.text}
              </div>
            ))}
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              You are viewing an earlier step — use → to return to the present.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
