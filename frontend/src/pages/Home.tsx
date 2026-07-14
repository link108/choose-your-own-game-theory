import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Scenario } from "../api";

export default function Home() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listScenarios()
      .then(setScenarios)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!scenarios) return <p className="spinner">Loading scenarios…</p>;

  return (
    <div>
      <h1>Your scenarios</h1>
      {scenarios.length === 0 && (
        <div className="card">
          <p>No scenarios yet.</p>
          <p className="muted">
            Create one: describe an idea (an engineering-management dilemma, a D&D one-shot, a
            tough customer call…) and the AI will draft a playable scenario you can tweak.
          </p>
          <div className="row">
            <Link to="/scenarios/new" className="btn btn-primary">
              Create your first scenario
            </Link>
            <Link to="/library" className="btn">
              Or browse the library
            </Link>
          </div>
        </div>
      )}
      {scenarios.map((s) => (
        <Link key={s.id} to={`/scenarios/${s.id}`} style={{ textDecoration: "none" }}>
          <div className="card">
            <h2>{s.title}</h2>
            <p className="muted">{s.premise}</p>
            <span className="meta">
              {s.roles.length} role{s.roles.length === 1 ? "" : "s"}
              {s.tone ? ` · ${s.tone}` : ""}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
