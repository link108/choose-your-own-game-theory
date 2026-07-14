import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, Scenario } from "../api";

export default function Library() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listLibrary()
      .then(setScenarios)
      .catch((e) => setError(e.message));
  }, []);

  // preserve the backend's category order (already sorted by category, title)
  const grouped = useMemo(() => {
    const groups = new Map<string, Scenario[]>();
    for (const s of scenarios ?? []) {
      const key = s.category || "Uncategorized";
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return groups;
  }, [scenarios]);

  if (error) return <div className="error">{error}</div>;
  if (!scenarios) return <p className="spinner">Loading library…</p>;

  if (scenarios.length === 0) {
    return (
      <div>
        <h1>Library</h1>
        <div className="card">
          <p>The library is empty.</p>
          <p className="muted">Seed it with `just seed`, or create your own scenario.</p>
        </div>
      </div>
    );
  }

  const categories = [...grouped.keys()];
  const shown = active ? [active] : categories;

  return (
    <div>
      <h1>Library</h1>
      <p className="muted">
        Ready-to-play scenarios. Pick one, choose a role, and see how your decisions hold up.
      </p>
      <div className="chips">
        <button className={`chip ${active === null ? "active" : ""}`} onClick={() => setActive(null)}>
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            className={`chip ${active === c ? "active" : ""}`}
            onClick={() => setActive(active === c ? null : c)}
          >
            {c} <span className="chip-count">{grouped.get(c)!.length}</span>
          </button>
        ))}
      </div>
      {shown.map((category) => (
        <section key={category}>
          <h2 className="category-heading">{category}</h2>
          {grouped.get(category)!.map((s) => (
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
        </section>
      ))}
    </div>
  );
}
