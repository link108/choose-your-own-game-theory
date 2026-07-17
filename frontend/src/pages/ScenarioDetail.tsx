import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  ApiError,
  ContextAnswer,
  ContextIntakeResult,
  PlayerContext,
  Playthrough,
  Scenario,
  ScenarioInsight,
  ScenarioUpdate,
} from "../api";

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

function ProgressSection({
  playthroughs,
  insight,
  onGenerate,
  generating,
  error,
}: {
  playthroughs: Playthrough[];
  insight: ScenarioInsight | null;
  onGenerate: () => void;
  generating: boolean;
  error: string;
}) {
  const finished = playthroughs.filter((pt) => pt.status !== "active");
  const attempts = playthroughs.length;
  const completed = playthroughs.filter((pt) => pt.status === "completed").length;
  const avgTurns = attempts
    ? Math.round((playthroughs.reduce((sum, pt) => sum + pt.turn_count, 0) / attempts) * 10) / 10
    : 0;
  const canRefresh = insight !== null && finished.length > insight.runs_analyzed;

  return (
    <div className="card">
      <h2>Your progress</h2>
      <p className="meta">
        {attempts} run{attempts === 1 ? "" : "s"} · {completed} completed · {avgTurns} avg
        turns per run
      </p>

      {insight ? (
        <>
          <p className="meta">
            Based on {insight.runs_analyzed} finished run
            {insight.runs_analyzed === 1 ? "" : "s"} ·{" "}
            {new Date(insight.generated_at).toLocaleDateString()}
          </p>
          <p className="narrative">{insight.insight.trend}</p>
          <p>{insight.insight.overall}</p>
          {insight.insight.patterns.length > 0 && (
            <>
              <h3>Patterns across runs</h3>
              <ul>
                {insight.insight.patterns.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </>
          )}
          {insight.insight.strengths.length > 0 && (
            <>
              <h3>What you do well</h3>
              <ul>
                {insight.insight.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {insight.insight.improvements.length > 0 && (
            <>
              <h3>Try next run</h3>
              <ul>
                {insight.insight.improvements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {canRefresh && (
            <button className="btn" disabled={generating} onClick={onGenerate}>
              {generating ? "Re-reading your runs…" : "Refresh with your latest runs"}
            </button>
          )}
        </>
      ) : finished.length === 0 ? (
        <p className="muted">Finish a run to unlock a progress analysis across your attempts.</p>
      ) : (
        <>
          <p className="muted">
            Get a coach's read on how you're doing across your {finished.length} finished run
            {finished.length === 1 ? "" : "s"}: trends, recurring habits, and what to try next
            time.
          </p>
          <button className="btn btn-primary" disabled={generating} onClick={onGenerate}>
            Analyze my progress
          </button>
          {generating && <p className="spinner">Reading through your runs…</p>}
        </>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function ContextStart({
  scenario,
  role,
  starting,
  onStart,
}: {
  scenario: Scenario;
  role: string;
  starting: boolean;
  onStart: (context: PlayerContext, summary: string) => void;
}) {
  const [initialContext, setInitialContext] = useState("");
  const [answers, setAnswers] = useState<ContextAnswer[]>([]);
  const [result, setResult] = useState<ContextIntakeResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const payload = (): PlayerContext => ({
    initial_context: initialContext.trim(),
    answers: answers.filter((answer) => answer.answer.trim()),
  });

  const assess = async () => {
    setChecking(true);
    setError("");
    try {
      const next = await api.assessContext(scenario.id, role, payload());
      setResult(next);
      if (next.status === "needs_more") {
        setAnswers((current) => {
          const completed = current.filter((answer) => answer.answer.trim());
          const known = new Set(completed.map((answer) => answer.question));
          return [
            ...completed,
            ...next.questions
              .filter((question) => !known.has(question))
              .map((question) => ({ question, answer: "" })),
          ];
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const setAnswer = (question: string, value: string) =>
    setAnswers((current) =>
      current.map((answer) =>
        answer.question === question ? { ...answer, answer: value } : answer,
      ),
    );

  const openQuestions = result?.status === "needs_more" ? result.questions : [];
  const defaultNotice =
    scenario.risk_domain === "health"
      ? "This simulation cannot diagnose a condition or replace care from a qualified clinician. Contact local emergency services for urgent or severe symptoms."
      : scenario.risk_domain === "legal" || scenario.risk_domain === "financial"
        ? `This ${scenario.risk_domain} simulation is not professional advice. Have consequential decisions reviewed by a qualified professional.`
        : scenario.risk_domain === "safety"
          ? "Prioritize immediate safety and contact local emergency services when there is imminent danger."
          : "";
  const notice = scenario.context_disclaimer || defaultNotice;

  return (
    <div className="context-intake">
      {notice && <div className="context-notice">{notice}</div>}

      {result?.status !== "ready" && (
        <>
          <label className="field">
            <span>Relevant background</span>
            <textarea
              value={initialContext}
              onChange={(event) => setInitialContext(event.target.value)}
              placeholder={
                scenario.context_prompt ||
                "Share the background, constraints, prior attempts, and outcome you want."
              }
            />
          </label>

          {openQuestions.map((question) => (
            <label className="field" key={question}>
              <span>{question}</span>
              <textarea
                value={answers.find((answer) => answer.question === question)?.answer ?? ""}
                onChange={(event) => setAnswer(question, event.target.value)}
              />
            </label>
          ))}

          <button
            className="btn btn-primary"
            onClick={assess}
            disabled={checking || !role}
          >
            {checking
              ? "Reviewing context…"
              : openQuestions.length > 0
                ? "Review answers"
                : "Review context"}
          </button>
        </>
      )}

      {result?.urgent_warning && <div className="warning">{result.urgent_warning}</div>}

      {result?.status === "ready" && (
        <>
          <h3>Context ready</h3>
          <p className="context-summary">{result.summary}</p>
          <div className="row">
            <button
              className="btn btn-primary"
              onClick={() => onStart(payload(), result.summary)}
              disabled={starting}
            >
              {starting ? "Setting the scene…" : "Start playthrough"}
            </button>
            <button className="btn" onClick={() => setResult(null)} disabled={starting}>
              Edit context
            </button>
          </div>
        </>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}

export default function ScenarioDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [playthroughs, setPlaythroughs] = useState<Playthrough[]>([]);
  const [updates, setUpdates] = useState<ScenarioUpdate[]>([]);
  const [insight, setInsight] = useState<ScenarioInsight | null>(null);
  const [generating, setGenerating] = useState(false);
  const [insightError, setInsightError] = useState("");
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
    api
      .getInsight(id)
      .then(setInsight)
      .catch((e) => {
        // 404 just means no insight generated yet
        if (!(e instanceof ApiError && e.status === 404)) setInsightError(e.message);
      });
  }, [id]);

  const generateInsight = async () => {
    if (!id) return;
    setGenerating(true);
    setInsightError("");
    try {
      setInsight(await api.generateInsight(id));
    } catch (e) {
      setInsightError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const start = async (context?: PlayerContext, contextSummary = "") => {
    if (!id) return;
    setStarting(true);
    setError("");
    try {
      const pt = await api.startPlaythrough(id, role, context, contextSummary);
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
          {!scenario.context_enabled && (
            <button
              className="btn btn-primary"
              onClick={() => start()}
              disabled={starting || !role}
            >
              {starting ? "Setting the scene…" : "Start playthrough"}
            </button>
          )}
        </div>
        {role && (
          <p className="muted">
            {scenario.roles.find((r) => r.name === role)?.description}
          </p>
        )}
        {scenario.context_enabled && (
          <ContextStart
            key={role}
            scenario={scenario}
            role={role}
            starting={starting}
            onStart={start}
          />
        )}
        {error && <div className="error">{error}</div>}
      </div>

      {playthroughs.length > 0 && (
        <ProgressSection
          playthroughs={playthroughs}
          insight={insight}
          onGenerate={generateInsight}
          generating={generating}
          error={insightError}
        />
      )}

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
