import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, PlaythroughListItem, Scenario } from "../api";
import { groupPlaythroughs } from "../lib/playthroughs";
import ScenarioCard from "./ScenarioCard";

function RunCard({ run }: { run: PlaythroughListItem }) {
  const active = run.status === "active";
  const statusLabel = active ? "In progress" : run.status;

  return (
    <article className="card run-card">
      <div className="run-card-main">
        <div className="run-card-heading">
          <Link to={`/scenarios/${run.scenario_id}`}>{run.scenario_title}</Link>
          <span className={`badge ${run.status}`}>{statusLabel}</span>
        </div>
        <p className="muted">Playing as {run.role_name}</p>
        <p className="meta">
          {run.turn_count} turn{run.turn_count === 1 ? "" : "s"} · Started{" "}
          {new Date(run.created_at).toLocaleString()}
        </p>
      </div>
      <div className="run-card-actions">
        <Link className={`btn ${active ? "btn-primary" : ""}`} to={`/play/${run.id}`}>
          {active ? "Resume" : "View run"}
        </Link>
        {!active && (
          <Link className="btn" to={`/review/${run.id}`}>
            Review
          </Link>
        )}
      </div>
    </article>
  );
}

export default function Home() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [runs, setRuns] = useState<PlaythroughListItem[] | null>(null);
  const [scenarioError, setScenarioError] = useState("");
  const [runError, setRunError] = useState("");

  useEffect(() => {
    api
      .listScenarios()
      .then(setScenarios)
      .catch((e) => setScenarioError(e.message));
    api
      .myPlaythroughs()
      .then(setRuns)
      .catch((e) => setRunError(e.message));
  }, []);

  if (!scenarios && !scenarioError) return <p className="spinner">Loading your scenarios…</p>;

  const groupedRuns = groupPlaythroughs(runs ?? []);

  return (
    <div className="my-scenarios-page">
      <header className="my-scenarios-hero">
        <p className="eyebrow">Your library</p>
        <h1>My scenarios</h1>
        <p className="page-intro">
          Resume stories in progress, revisit previous runs, or manage scenarios you created.
        </p>
      </header>

      {runError && <div className="error">Could not load your runs: {runError}</div>}

      {runs === null && !runError ? (
        <p className="spinner">Loading your runs…</p>
      ) : (
        <>
          {groupedRuns.active.length > 0 && (
            <section aria-labelledby="active-runs-heading">
              <div className="section-header">
                <div>
                  <h2 className="category-heading" id="active-runs-heading">
                    In progress
                  </h2>
                  <p className="muted">Continue from the exact version where each run began.</p>
                </div>
              </div>
              <div className="run-list">
                {groupedRuns.active.map((run) => (
                  <RunCard key={run.id} run={run} />
                ))}
              </div>
            </section>
          )}

          {groupedRuns.previous.length > 0 && (
            <section aria-labelledby="previous-runs-heading">
              <div className="section-header">
                <div>
                  <h2 className="category-heading" id="previous-runs-heading">
                    Previous runs
                  </h2>
                  <p className="muted">Revisit completed and abandoned playthroughs.</p>
                </div>
              </div>
              <div className="run-list">
                {groupedRuns.previous.map((run) => (
                  <RunCard key={run.id} run={run} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <div className="section-header">
        <div>
          <h2 className="category-heading">Scenarios you created</h2>
          <p className="muted">Open a scenario to play it again or make changes.</p>
        </div>
        <Link to="/scenarios/new" className="btn btn-primary">
          Create scenario
        </Link>
      </div>

      {scenarioError && <div className="error">Could not load your scenarios: {scenarioError}</div>}
      {scenarios?.length === 0 && (
        <div className="card">
          <p>You haven’t created any scenarios yet.</p>
          <p className="muted">
            Create one: describe an idea (an engineering-management dilemma, a D&amp;D one-shot, a
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
        {(scenarios ?? []).map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} />
        ))}
      </div>
    </div>
  );
}
