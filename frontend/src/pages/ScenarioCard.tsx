import { Link } from "react-router-dom";
import { Scenario } from "../api";

export default function ScenarioCard({ scenario }: { scenario: Scenario }) {
  return (
    <Link to={`/scenarios/${scenario.id}`} className="card-link">
      <div className="card">
        <h2>{scenario.title}</h2>
        <p className="premise">{scenario.premise}</p>
        <span className="meta">
          {scenario.roles.length} role{scenario.roles.length === 1 ? "" : "s"}
          {scenario.tone ? ` · ${scenario.tone}` : ""}
        </span>
      </div>
    </Link>
  );
}
