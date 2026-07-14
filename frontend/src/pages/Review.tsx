import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, PlaythroughAnalysis, PlaythroughReview } from "../api";

function AnalysisCard({ analysis }: { analysis: PlaythroughAnalysis }) {
  return (
    <div className="card">
      <h2>How you played</h2>
      <p className="narrative">{analysis.outcome}</p>
      <p>{analysis.overall}</p>

      {analysis.decisions.length > 0 && (
        <>
          <h3>Key decisions</h3>
          {analysis.decisions.map((d) => (
            <div className="subcard" key={d.turn_index}>
              <p>
                <span className="badge">Turn {d.turn_index + 1}</span>{" "}
                <em>{d.choice}</em>
              </p>
              <p>{d.commentary}</p>
              {d.better_alternative && (
                <p className="muted">Stronger move: {d.better_alternative}</p>
              )}
            </div>
          ))}
        </>
      )}

      {analysis.strengths.length > 0 && (
        <>
          <h3>What went well</h3>
          <ul>
            {analysis.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {analysis.improvements.length > 0 && (
        <>
          <h3>What to work on</h3>
          <ul>
            {analysis.improvements.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function Review() {
  const { id } = useParams();
  const [review, setReview] = useState<PlaythroughReview | null>(null);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  useEffect(() => {
    if (!id) return;
    api
      .review(id)
      .then(setReview)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!review) return <p className="spinner">Loading…</p>;

  const analyze = async () => {
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const analysis = await api.analyze(review.id);
      setReview({ ...review, analysis });
    } catch (e) {
      setAnalysisError((e as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div>
      <h1>Review: {review.scenario_title}</h1>
      <p className="muted">
        Played as <strong>{review.role_name}</strong> · {review.status} ·{" "}
        <Link to={`/scenarios/${review.scenario_id}`}>back to scenario</Link>
      </p>
      <p className="muted">
        Behind the curtain: every turn below shows the full game-master state — all actors'
        private reasoning, hidden facts, and every option you saw (chosen ones highlighted).
      </p>

      {review.analysis ? (
        <AnalysisCard analysis={review.analysis} />
      ) : review.status === "active" ? null : (
        <div className="card">
          <h2>How you played</h2>
          <p className="muted">
            Get feedback on your choices: which decisions mattered, what the hidden state
            meant for them, and what to try next time.
          </p>
          <button className="btn btn-primary" disabled={analyzing} onClick={analyze}>
            Analyze my choices
          </button>
          {analyzing && <p className="spinner">Reviewing your decisions…</p>}
          {analysisError && <div className="error">{analysisError}</div>}
        </div>
      )}

      {review.turns.map((turn) => (
        <div className="card" key={turn.index}>
          <h2>Turn {turn.index + 1}</h2>
          <p className="narrative">{turn.player_view.narrative}</p>

          {turn.player_view.options.length > 0 && (
            <>
              <p className="muted">Options:</p>
              {turn.player_view.options.map((opt) => (
                <div
                  key={opt.id}
                  className={`option-btn ${opt.id === turn.chosen_option_id ? "chosen" : ""}`}
                  style={{ cursor: "default" }}
                >
                  {opt.text}
                  {opt.custom && (
                    <span className="badge" style={{ marginLeft: "0.6rem" }}>
                      your idea
                    </span>
                  )}
                  {opt.id === turn.chosen_option_id && (
                    <span className="badge completed" style={{ marginLeft: "0.6rem" }}>
                      chosen
                    </span>
                  )}
                  {opt.reasoning && (
                    <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                      {opt.reasoning}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {turn.is_final && turn.player_view.epilogue && (
            <>
              <h2>Epilogue</h2>
              <p className="narrative">{turn.player_view.epilogue}</p>
            </>
          )}

          <details className="gm" open={turn.is_final}>
            <summary>Game-master state (hidden during play)</summary>
            <p>
              <strong>Scene:</strong> {turn.gm_state.scene_summary}
            </p>
            {turn.gm_state.goal_progress && (
              <p>
                <strong>Goal progress:</strong> {turn.gm_state.goal_progress}
              </p>
            )}
            {turn.gm_state.hidden_facts.length > 0 && (
              <>
                <p>
                  <strong>Hidden facts:</strong>
                </p>
                <ul>
                  {turn.gm_state.hidden_facts.map((fact, i) => (
                    <li key={i}>{fact}</li>
                  ))}
                </ul>
              </>
            )}
            {turn.gm_state.actors.map((actor) => (
              <div className="subcard" key={actor.name}>
                <strong>{actor.name}</strong>
                {actor.status && <div>Status: {actor.status}</div>}
                {actor.intent && <div>Intent: {actor.intent}</div>}
                {actor.reasoning && <div className="muted">Reasoning: {actor.reasoning}</div>}
              </div>
            ))}
          </details>
        </div>
      ))}
    </div>
  );
}
