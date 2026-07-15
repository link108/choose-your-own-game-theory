import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Playthrough, Scenario, ScenarioUpdate } from "../api";

function SituationLog({ updates }: { updates: ScenarioUpdate[] }) {
  if (updates.length === 0) return null;
  return (
    <div>
      <h2>Situation log</h2>
      <p className="muted">
        This scenario tracks a real-world story and is revised as it develops. Playthroughs
        always finish in the version of the world they started in.
      </p>
      {updates.map((u) => (
        <div className="card" key={u.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{u.headline}</strong>
            <span className="meta">{new Date(u.created_at).toLocaleDateString()}</span>
          </div>
          <p>{u.summary}</p>
          {u.changes && <p className="muted">{u.changes}</p>}
          <p className="meta">
            Sources:{" "}
            {u.sources.map((s, i) => (
              <span key={i}>
                {i > 0 && " · "}
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.outlet}
                </a>
                {s.lean ? ` (${s.lean})` : ""}
              </span>
            ))}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function ScenarioDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [playthroughs, setPlaythroughs] = useState<Playthrough[]>([]);
  const [updates, setUpdates] = useState<ScenarioUpdate[]>([]);
  const [role, setRole] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api
      .getScenario(id)
      .then((s) => {
        setScenario(s);
        if (s.roles.length > 0) setRole(s.roles[0].name);
        if (s.is_living) api.listUpdates(id).then(setUpdates).catch(() => {});
      })
      .catch((e) => setError(e.message));
    api.listPlaythroughs(id).then(setPlaythroughs).catch(() => {});
  }, [id]);

  const start = async () => {
    if (!id) return;
    setStarting(true);
    setError("");
    try {
      const pt = await api.startPlaythrough(id, role);
      navigate(`/play/${pt.id}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  if (error && !scenario) return <div className="error">{error}</div>;
  if (!scenario) return <p className="spinner">Loading…</p>;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{scenario.title}</h1>
        {!scenario.is_library && (
          <Link className="btn" to={`/scenarios/${scenario.id}/edit`}>
            Edit
          </Link>
        )}
      </div>
      {scenario.category && <span className="badge">{scenario.category}</span>}{" "}
      {scenario.is_living && <span className="badge active">living</span>}
      <p className="narrative">{scenario.premise}</p>
      {scenario.setting && <p className="muted narrative">{scenario.setting}</p>}
      {scenario.goal && (
        <p>
          <strong>Goal:</strong> {scenario.goal}
        </p>
      )}

      <div className="card">
        <h2>Play</h2>
        <div className="row">
          <span className="muted">Play as</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {scenario.roles.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={start} disabled={starting || !role}>
            {starting ? "Setting the scene…" : "Start playthrough"}
          </button>
        </div>
        {role && (
          <p className="muted">
            {scenario.roles.find((r) => r.name === role)?.description}
          </p>
        )}
        {error && <div className="error">{error}</div>}
      </div>

      {scenario.is_living && <SituationLog updates={updates} />}

      <h2>Playthroughs</h2>
      {playthroughs.length === 0 && <p className="muted">None yet.</p>}
      {playthroughs.map((pt) => (
        <div className="card" key={pt.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <strong>{pt.role_name}</strong>{" "}
              <span className={`badge ${pt.status}`}>{pt.status}</span>
              <div className="meta">
                {pt.turn_count} turn{pt.turn_count === 1 ? "" : "s"} ·{" "}
                {new Date(pt.created_at).toLocaleString()}
              </div>
            </div>
            <div className="row">
              {pt.status === "active" && (
                <Link className="btn btn-primary" to={`/play/${pt.id}`}>
                  Resume
                </Link>
              )}
              <Link className="btn" to={`/review/${pt.id}`}>
                Review
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
