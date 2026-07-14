import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Scenario } from "../api";
import ScenarioCard from "./ScenarioCard";

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
      <div className="card-grid">
        {scenarios.map((s) => (
          <ScenarioCard key={s.id} scenario={s} />
        ))}
      </div>
    </div>
  );
}
