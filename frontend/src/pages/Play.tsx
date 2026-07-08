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

  useEffect(() => {
    if (!id) return;
    api
      .getPlaythrough(id)
      .then(setPt)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error && !pt) return <div className="error">{error}</div>;
  if (!pt) return <p className="spinner">Loading…</p>;

  const current = pt.turns[pt.turns.length - 1];
  const past = pt.turns.slice(0, -1);
  const active = pt.status === "active";

  const refresh = async () => setPt(await api.getPlaythrough(pt.id));

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

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{pt.scenario_title}</h1>
        <span className={`badge ${pt.status}`}>{pt.status}</span>
      </div>
      <p className="muted">
        Playing as <strong>{pt.role_name}</strong> ·{" "}
        <Link to={`/scenarios/${pt.scenario_id}`}>back to scenario</Link>
      </p>

      {past.map((turn) => (
        <div className="card turn-past" key={turn.index}>
          <p className="narrative">{turn.player_view.narrative}</p>
          {turn.chosen_option_id && (
            <p>
              <span className="muted">You chose:</span> <em>{chosenText(turn)}</em>
            </p>
          )}
        </div>
      ))}

      {current && (
        <div className="card">
          <p className="narrative">{current.player_view.narrative}</p>
          {current.player_view.visible_state_summary && (
            <p className="muted">{current.player_view.visible_state_summary}</p>
          )}

          {current.is_final ? (
            <>
              <hr />
              <h2>Epilogue</h2>
              <p className="narrative">{current.player_view.epilogue}</p>
              <Link className="btn btn-primary" to={`/review/${pt.id}`}>
                Review the full story
              </Link>
            </>
          ) : active ? (
            <>
              <hr />
              <h2>What do you do?</h2>
              {current.player_view.options.map((opt) => (
                <button
                  key={opt.id}
                  className="option-btn"
                  disabled={busy}
                  onClick={() => choose(opt.id)}
                >
                  {opt.text}
                </button>
              ))}
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
            <p className="muted">This playthrough is {pt.status}.</p>
          )}
        </div>
      )}
    </div>
  );
}
