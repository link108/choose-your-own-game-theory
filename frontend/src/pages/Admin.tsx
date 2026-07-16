import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  AdminStats,
  AdminUserStats,
  LivingRunResult,
  Scenario,
  ScenarioContent,
  ScenarioStats,
  ScenarioUpdateAdmin,
} from "../api";
import { useAuth } from "../auth";
import { StatTiles } from "./Stats";

const CONTENT_FIELDS: (keyof ScenarioContent)[] = [
  "title",
  "premise",
  "setting",
  "tone",
  "goal",
  "gm_notes",
  "roles",
  "npcs",
];

function fieldText(value: ScenarioContent[keyof ScenarioContent]): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function Diff({ current, proposed }: { current: ScenarioContent; proposed: ScenarioContent }) {
  const changed = CONTENT_FIELDS.filter(
    (f) => fieldText(current[f]) !== fieldText(proposed[f]),
  );
  if (changed.length === 0) return <p className="muted">No content changes.</p>;
  return (
    <div>
      {changed.map((field) => (
        <div key={field} className="subcard">
          <strong>{field}</strong>
          <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
            {fieldText(current[field]) || "(empty)"}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{fieldText(proposed[field]) || "(empty)"}</p>
        </div>
      ))}
    </div>
  );
}

function SourceList({ update }: { update: ScenarioUpdateAdmin }) {
  return (
    <p className="meta">
      Sources:{" "}
      {update.sources.map((s, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <a href={s.url} target="_blank" rel="noreferrer">
            {s.outlet}
          </a>{" "}
          <span className="badge">{s.lean}</span>
        </span>
      ))}
    </p>
  );
}

function DraftCard({
  update,
  onReviewed,
}: {
  update: ScenarioUpdateAdmin;
  onReviewed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [error, setError] = useState("");

  const review = async (action: "approve" | "reject") => {
    setBusy(true);
    setError("");
    try {
      if (action === "approve") await api.adminApproveUpdate(update.id);
      else await api.adminRejectUpdate(update.id);
      onReviewed();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2>{update.headline}</h2>
        <span className="meta">{new Date(update.created_at).toLocaleDateString()}</span>
      </div>
      <p className="meta">
        For <Link to={`/scenarios/${update.scenario_id}`}>{update.scenario_title}</Link>
      </p>
      <p>{update.summary}</p>
      <p className="muted">{update.changes}</p>
      <SourceList update={update} />
      <div className="row">
        <button className="btn btn-primary" disabled={busy} onClick={() => review("approve")}>
          Approve &amp; publish
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={() => review("reject")}>
          Reject
        </button>
        <button className="btn" onClick={() => setShowDiff(!showDiff)}>
          {showDiff ? "Hide changes" : "Show proposed changes"}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {showDiff && <Diff current={update.current} proposed={update.proposed} />}
    </div>
  );
}

function fmtDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function UserRow({ row }: { row: AdminUserStats }) {
  const [open, setOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<ScenarioStats[] | null>(null);
  const [error, setError] = useState("");

  const toggle = () => {
    setOpen(!open);
    if (!open && breakdown === null) {
      api
        .adminSessionStats(row.session_id)
        .then(setBreakdown)
        .catch((e) => setError(e.message));
    }
  };

  return (
    <>
      <tr>
        <td>
          {row.email ?? <span className="muted">guest</span>}
          {row.role === "admin" && (
            <span className="badge" style={{ marginLeft: "0.5rem" }}>
              admin
            </span>
          )}
        </td>
        <td>{row.playthroughs}</td>
        <td>{row.completed}</td>
        <td>{row.scenarios_tried}</td>
        <td>{row.scenarios_created}</td>
        <td>{row.avg_turns}</td>
        <td className="meta">{fmtDate(row.last_active_at)}</td>
        <td>
          <button className="btn" onClick={toggle} disabled={row.playthroughs === 0}>
            {open ? "Hide" : "Runs"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8}>
            {error && <div className="error">{error}</div>}
            {!breakdown && !error && <p className="spinner">Loading…</p>}
            {breakdown && (
              <table className="table">
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Runs</th>
                    <th>Completed</th>
                    <th>Abandoned</th>
                    <th>In progress</th>
                    <th>Avg turns</th>
                    <th>Last played</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((s) => (
                    <tr key={s.scenario_id}>
                      <td>
                        <Link to={`/scenarios/${s.scenario_id}`}>{s.title}</Link>
                      </td>
                      <td>{s.attempts}</td>
                      <td>{s.completed}</td>
                      <td>{s.abandoned}</td>
                      <td>{s.active}</td>
                      <td>{s.avg_turns}</td>
                      <td className="meta">{fmtDate(s.last_played_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function UsageTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .adminStats()
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!stats) return <p className="spinner">Loading…</p>;

  return (
    <div>
      <p className="page-intro">
        Every player's activity at a glance — registered accounts and anonymous guest
        sessions alike.
      </p>
      <StatTiles
        items={[
          ["Users", stats.totals.users],
          ["Guest sessions", stats.totals.guest_sessions],
          ["Scenarios", stats.totals.scenarios],
          ["Playthroughs", stats.totals.playthroughs],
          ["Completed", stats.totals.completed],
          ["In progress", stats.totals.active],
          ["Turns played", stats.totals.total_turns],
          ["LLM calls", stats.totals.llm_calls],
        ]}
      />

      <h2>Players</h2>
      {stats.users.length === 0 && <p className="muted">No activity yet.</p>}
      {stats.users.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Runs</th>
                <th>Completed</th>
                <th>Scenarios tried</th>
                <th>Created</th>
                <th>Avg turns</th>
                <th>Last active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stats.users.map((row) => (
                <UserRow key={row.session_id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Scenarios</h2>
      {stats.scenarios.length === 0 && <p className="muted">No playthroughs yet.</p>}
      {stats.scenarios.length > 0 && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Players</th>
                <th>Runs</th>
                <th>Completed</th>
                <th>Avg turns</th>
                <th>Last played</th>
              </tr>
            </thead>
            <tbody>
              {stats.scenarios.map((s) => (
                <tr key={s.scenario_id}>
                  <td>
                    <Link to={`/scenarios/${s.scenario_id}`}>{s.title}</Link>
                    {s.is_living && (
                      <span className="badge active" style={{ marginLeft: "0.5rem" }}>
                        living
                      </span>
                    )}
                    {s.is_library && !s.is_living && (
                      <span className="badge" style={{ marginLeft: "0.5rem" }}>
                        library
                      </span>
                    )}
                  </td>
                  <td>{s.players}</td>
                  <td>{s.attempts}</td>
                  <td>{s.completed}</td>
                  <td>{s.avg_turns}</td>
                  <td className="meta">{fmtDate(s.last_played_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LivingTab() {
  const [drafts, setDrafts] = useState<ScenarioUpdateAdmin[] | null>(null);
  const [history, setHistory] = useState<ScenarioUpdateAdmin[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<LivingRunResult | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    api
      .adminListUpdates()
      .then((updates) => {
        setDrafts(updates.filter((u) => u.status === "draft"));
        setHistory(updates.filter((u) => u.status !== "draft"));
      })
      .catch((e) => setError(e.message));
    Promise.all([api.listScenarios(), api.listLibrary()])
      .then(([own, library]) => {
        const byId = new Map<string, Scenario>();
        for (const s of [...own, ...library]) byId.set(s.id, s);
        setScenarios([...byId.values()].sort((a, b) => a.title.localeCompare(b.title)));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runPass = async () => {
    setRunning(true);
    setError("");
    setRunResult(null);
    try {
      const result = await api.adminRunLiving();
      setRunResult(result);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const toggleLiving = async (scenario: Scenario) => {
    try {
      await api.adminSetLiving(scenario.id, !scenario.is_living);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const living = scenarios.filter((s) => s.is_living);
  const candidates = scenarios.filter((s) => !s.is_living);

  return (
    <div>
      <p className="page-intro">
        The daily pass reads the news feeds and drafts updates; nothing goes live until you
        approve it here.
      </p>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="row">
          <button className="btn btn-primary" onClick={runPass} disabled={running}>
            {running ? "Reading the news…" : "Run news pass now"}
          </button>
          {runResult && (
            <span className="meta">
              {runResult.articles_fetched} articles · {runResult.scenarios_checked} checked ·{" "}
              {runResult.drafts_created} draft{runResult.drafts_created === 1 ? "" : "s"}
              {runResult.skipped_pending_review > 0 &&
                ` · ${runResult.skipped_pending_review} awaiting review`}
            </span>
          )}
        </div>
        {runResult && runResult.errors.length > 0 && (
          <p className="meta">{runResult.errors.join(" · ")}</p>
        )}
      </div>

      <h2>Pending review {drafts && drafts.length > 0 ? `(${drafts.length})` : ""}</h2>
      {!drafts && <p className="spinner">Loading…</p>}
      {drafts && drafts.length === 0 && <p className="muted">No drafts waiting.</p>}
      {drafts?.map((u) => <DraftCard key={u.id} update={u} onReviewed={refresh} />)}

      <h2>Scenarios</h2>
      {living.length === 0 && (
        <p className="muted">
          No living scenarios yet. Promote one below — create it first via{" "}
          <Link to="/scenarios/new">New scenario</Link>.
        </p>
      )}
      {living.map((s) => (
        <div className="card" key={s.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <Link to={`/scenarios/${s.id}`}>
                <strong>{s.title}</strong>
              </Link>{" "}
              <span className="badge">living</span>
              <div className="meta">{s.category || "Uncategorized"}</div>
            </div>
            <div className="row">
              <button
                className="btn"
                onClick={() => api.adminRunLiving(s.id).then(refresh).catch((e) => setError(e.message))}
              >
                Check for updates
              </button>
              <button className="btn btn-danger" onClick={() => toggleLiving(s)}>
                Stop tracking
              </button>
            </div>
          </div>
        </div>
      ))}
      {candidates.length > 0 && (
        <details>
          <summary className="muted" style={{ cursor: "pointer" }}>
            Promote a scenario to living ({candidates.length} available)
          </summary>
          {candidates.map((s) => (
            <div className="card" key={s.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{s.title}</strong>
                  <div className="meta">{s.category || "Uncategorized"}</div>
                </div>
                <button className="btn" onClick={() => toggleLiving(s)}>
                  Make living
                </button>
              </div>
            </div>
          ))}
        </details>
      )}

      {history.length > 0 && (
        <>
          <h2>Review history</h2>
          {history.map((u) => (
            <div className="card" key={u.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{u.headline}</strong>{" "}
                  <span className={`badge ${u.status === "published" ? "completed" : "abandoned"}`}>
                    {u.status}
                  </span>
                  <div className="meta">
                    {u.scenario_title} · {new Date(u.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export default function Admin() {
  const { user, ready } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<"usage" | "living">("usage");

  if (!ready) return <p className="spinner">Loading…</p>;
  if (!isAdmin) {
    return (
      <div>
        <h1>Admin</h1>
        <div className="card">
          {user ? (
            <p className="muted">This page needs the admin role — you're signed in as {user.email}.</p>
          ) : (
            <p className="muted">
              <Link to="/login" state={{ from: "/admin" }}>
                Sign in
              </Link>{" "}
              with the admin account to see usage and manage living scenarios.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Admin</h1>
      <div className="tabs">
        <button
          className={`tab ${tab === "usage" ? "active" : ""}`}
          onClick={() => setTab("usage")}
        >
          Usage
        </button>
        <button
          className={`tab ${tab === "living" ? "active" : ""}`}
          onClick={() => setTab("living")}
        >
          Living scenarios
        </button>
      </div>
      {tab === "usage" ? <UsageTab /> : <LivingTab />}
    </div>
  );
}
