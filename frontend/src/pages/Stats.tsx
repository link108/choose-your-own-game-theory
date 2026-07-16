import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, UserStats } from "../api";

export function StatTiles({ items }: { items: [string, string | number][] }) {
  return (
    <div className="stat-grid">
      {items.map(([label, value]) => (
        <div className="stat" key={label}>
          <div className="stat-value">{value}</div>
          <div className="stat-label">{label}</div>
        </div>
      ))}
    </div>
  );
}

export default function Stats() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .myStats()
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!stats) return <p className="spinner">Loading…</p>;

  return (
    <div>
      <h1>Your stats</h1>
      <p className="page-intro">
        Everything you've played, and how it's going scenario by scenario.
      </p>

      <StatTiles
        items={[
          ["Scenarios tried", stats.scenarios_tried],
          ["Total runs", stats.total_playthroughs],
          ["Completed", stats.completed],
          ["In progress", stats.active],
          ["Abandoned", stats.abandoned],
          ["Avg turns per run", stats.avg_turns],
        ]}
      />

      <h2>By scenario</h2>
      {stats.scenarios.length === 0 && (
        <p className="muted">
          Nothing yet — pick something from the <Link to="/library">library</Link> and play a
          run.
        </p>
      )}
      {stats.scenarios.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Runs</th>
                <th>Completed</th>
                <th>Avg turns</th>
                <th>Last played</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stats.scenarios.map((s) => (
                <tr key={s.scenario_id}>
                  <td>
                    <Link to={`/scenarios/${s.scenario_id}`}>{s.title}</Link>
                    {s.active > 0 && (
                      <span className="badge active" style={{ marginLeft: "0.5rem" }}>
                        {s.active} in progress
                      </span>
                    )}
                  </td>
                  <td>{s.attempts}</td>
                  <td>{s.completed}</td>
                  <td>{s.avg_turns}</td>
                  <td className="meta">
                    {s.last_played_at ? new Date(s.last_played_at).toLocaleDateString() : "—"}
                  </td>
                  <td>
                    <Link className="btn" to={`/scenarios/${s.scenario_id}`}>
                      {s.has_insight ? "View progress" : "Analyze progress"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
