import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, PlaythroughReview } from "../api";

export default function Review() {
  const { id } = useParams();
  const [review, setReview] = useState<PlaythroughReview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api
      .review(id)
      .then(setReview)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="error">{error}</div>;
  if (!review) return <p className="spinner">Loading…</p>;

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
                  {opt.id === turn.chosen_option_id && (
                    <span className="badge completed" style={{ marginLeft: "0.6rem" }}>
                      chosen
                    </span>
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
