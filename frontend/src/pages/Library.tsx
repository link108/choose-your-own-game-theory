import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Link } from "react-router-dom";
import { api, Scenario } from "../api";
import {
  filterScenarios,
  getCategoryPresentation,
  groupScenarios,
  recentlyAdded,
  selectFeaturedScenario,
} from "../lib/library";
import { CategoryIcon, LivingWorldBadge } from "./ScenarioCard";
import ScenarioCard from "./ScenarioCard";

function LibrarySkeleton() {
  return (
    <div className="library-page" aria-busy="true" aria-label="Loading library">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line wide" />
      <div className="skeleton skeleton-search" />
      <div className="skeleton skeleton-featured" />
      <div className="card-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="card scenario-card skeleton-card" key={index}>
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line wide" />
            <div className="skeleton skeleton-line" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function FeaturedScenario({ scenario }: { scenario: Scenario }) {
  const presentation = getCategoryPresentation(scenario.category);
  const roles = scenario.roles.length;

  return (
    <section className="featured-section" aria-labelledby="featured-heading">
      <div
        className="featured-card"
        style={{ "--category-accent": presentation.accent } as React.CSSProperties}
      >
        <div className="featured-pattern" aria-hidden="true" />
        <div className="featured-content">
          <div className="scenario-card-topline">
            <span className="category-pill">
              <CategoryIcon name={presentation.icon} />
              {presentation.label}
            </span>
            {scenario.is_living && <LivingWorldBadge />}
          </div>
          <p className="eyebrow" id="featured-heading">
            Featured Scenario
          </p>
          <h2>{scenario.title}</h2>
          <p>{scenario.premise}</p>
          <div className="featured-meta">
            <span>
              {roles} role{roles === 1 ? "" : "s"}
            </span>
            {scenario.tone && <span>{scenario.tone}</span>}
          </div>
          <Link to={`/scenarios/${scenario.id}`} className="btn btn-primary">
            View Scenario
          </Link>
        </div>
      </div>
    </section>
  );
}

function StateCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="card state-card">
      <h2>{title}</h2>
      <p className="muted">{children}</p>
      {action && <div className="row">{action}</div>}
    </div>
  );
}

function SectionHeader({
  id,
  title,
  children,
  action,
}: {
  id?: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2 className="category-heading" id={id}>
          {title}
        </h2>
        {children && <p className="muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}

export default function Library() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listLibrary()
      .then(setScenarios)
      .catch((e) => setError(e.message));
  }, []);

  const grouped = useMemo(() => groupScenarios(scenarios ?? []), [scenarios]);
  const filtered = useMemo(
    () => filterScenarios(scenarios ?? [], { category: active, query }),
    [active, query, scenarios],
  );
  const featured = useMemo(() => selectFeaturedScenario(scenarios ?? []), [scenarios]);
  const livingWorlds = useMemo(() => (scenarios ?? []).filter((s) => s.is_living), [scenarios]);
  const recent = useMemo(() => recentlyAdded(scenarios ?? [], 6), [scenarios]);

  if (error) return <div className="error">{error}</div>;
  if (!scenarios) return <LibrarySkeleton />;

  if (scenarios.length === 0) {
    return (
      <div className="library-page">
        <h1>Choose your next dilemma</h1>
        <StateCard
          title="The library is empty"
          action={
            <Link to="/scenarios/new" className="btn btn-primary">
              Create a scenario
            </Link>
          }
        >
          Seed it with `just seed`, or create your own scenario.
        </StateCard>
      </div>
    );
  }

  const categories = [...grouped.keys()];
  const isFiltering = Boolean(active || query.trim());

  return (
    <div className="library-page">
      <header className="library-hero">
        <p className="eyebrow">Scenario Library</p>
        <h1>Choose your next dilemma</h1>
        <p className="page-intro">
          Browse strategic, role-driven scenarios built for negotiation, tradeoffs, alliances,
          and hard calls.
        </p>
      </header>

      <div className="library-search-wrap">
        <label className="sr-only" htmlFor="scenario-search">
          Search scenarios
        </label>
        <div className="library-search">
          <SearchIcon />
          <input
            id="scenario-search"
            type="search"
            placeholder="Search scenarios"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button className="clear-search" type="button" onClick={() => setQuery("")}>
              Clear
            </button>
          )}
        </div>
        <p className="result-count" aria-live="polite">
          {filtered.length} matching scenario{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      {featured && !isFiltering && <FeaturedScenario scenario={featured} />}

      <div className="library-filter-row">
        <label className="filter-field">
          <span>Category</span>
          <select
            value={active ?? ""}
            onChange={(event) => setActive(event.target.value || null)}
            aria-label="Filter scenarios by category"
          >
            <option value="">All categories ({scenarios.length})</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category} ({grouped.get(category)!.length})
              </option>
            ))}
          </select>
        </label>
        {active && (
          <button className="btn" type="button" onClick={() => setActive(null)}>
            Clear category
          </button>
        )}
      </div>

      {isFiltering ? (
        <section aria-labelledby="results-heading">
          <SectionHeader id="results-heading" title={active ?? "Search results"}>
            {query ? `Results matching "${query.trim()}".` : "Filtered scenario results."}
          </SectionHeader>
          {filtered.length > 0 ? (
            <div className="card-grid">
              {filtered.map((s) => (
                <ScenarioCard key={s.id} scenario={s} />
              ))}
            </div>
          ) : (
            <StateCard
              title="No scenarios match"
              action={
                <button className="btn" type="button" onClick={() => { setQuery(""); setActive(null); }}>
                  Clear filters
                </button>
              }
            >
              Try a broader search or choose another category.
            </StateCard>
          )}
        </section>
      ) : (
        <>
          {livingWorlds.length > 0 && (
            <section aria-labelledby="living-worlds-heading">
              <SectionHeader id="living-worlds-heading" title="Living Worlds">
                Living worlds continue to evolve as players make decisions, creating an ongoing
                shared history.
              </SectionHeader>
              <div className="card-grid">
                {livingWorlds.slice(0, 3).map((s) => (
                  <ScenarioCard key={s.id} scenario={s} />
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="recently-added-heading">
            <SectionHeader id="recently-added-heading" title="Recently Added" />
            <div className="card-grid">
              {recent.map((s) => (
                <ScenarioCard key={s.id} scenario={s} />
              ))}
            </div>
          </section>

          <section aria-labelledby="browse-category-heading">
            <SectionHeader id="browse-category-heading" title="Browse by Category" />
            {categories.map((category) => {
              const presentation = getCategoryPresentation(category);
              const items = grouped.get(category) ?? [];
              return (
                <section
                  className="category-preview"
                  key={category}
                  style={{ "--category-accent": presentation.accent } as React.CSSProperties}
                >
                  <SectionHeader
                    title={category}
                    action={
                      <button className="btn" type="button" onClick={() => setActive(category)}>
                        View all
                      </button>
                    }
                  >
                    <span className="category-title-icon">
                      <CategoryIcon name={presentation.icon} />
                      {items.length} scenario{items.length === 1 ? "" : "s"}
                    </span>
                  </SectionHeader>
                  <div className="card-grid preview-grid">
                    {items.slice(0, 4).map((s) => (
                      <ScenarioCard key={s.id} scenario={s} compact />
                    ))}
                  </div>
                </section>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
