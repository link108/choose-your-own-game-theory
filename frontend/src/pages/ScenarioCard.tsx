import { Link } from "react-router-dom";
import type React from "react";
import { Scenario } from "../api";
import { CategoryIconName, getCategoryPresentation } from "../lib/library";

function CategoryIcon({ name }: { name: CategoryIconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "globe") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" />
      </svg>
    );
  }
  if (name === "network") {
    return (
      <svg {...common}>
        <path d="M6 7h6v6H6zM15 4h5v5h-5zM15 15h5v5h-5zM12 10l3-3M12 10l3 7" />
      </svg>
    );
  }
  if (name === "castle") {
    return (
      <svg {...common}>
        <path d="M5 21V8l3 2 4-3 4 3 3-2v13M8 21v-6h8v6M8 5v4M16 5v4" />
      </svg>
    );
  }
  if (name === "grid") {
    return (
      <svg {...common}>
        <path d="M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16" />
      </svg>
    );
  }
  if (name === "orbit") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="2.5" />
        <path d="M4 12c2-5 14-5 16 0-2 5-14 5-16 0ZM12 4c5 2 5 14 0 16-5-2-5-14 0-16Z" />
      </svg>
    );
  }
  if (name === "keyhole") {
    return (
      <svg {...common}>
        <path d="M12 3a5 5 0 0 0-2 9.58L8 21h8l-2-8.42A5 5 0 0 0 12 3Z" />
      </svg>
    );
  }
  if (name === "spark") {
    return (
      <svg {...common}>
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16Z" />
      </svg>
    );
  }
  if (name === "briefcase") {
    return (
      <svg {...common}>
        <path d="M9 7V5h6v2M4 7h16v12H4zM4 12h16M10 12v2h4v-2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3l7 18-7-4-7 4 7-18Z" />
    </svg>
  );
}

export function LivingWorldBadge() {
  return (
    <span
      className="badge living-badge"
      title="Living worlds continue to evolve as players make decisions, creating an ongoing shared history."
      aria-label="Living World: continues to evolve as players make decisions."
    >
      Living World
    </span>
  );
}

export default function ScenarioCard({ scenario, compact = false }: { scenario: Scenario; compact?: boolean }) {
  const presentation = getCategoryPresentation(scenario.category);
  const roles = scenario.roles.length;

  return (
    <Link
      to={`/scenarios/${scenario.id}`}
      className={`card-link scenario-card-link ${compact ? "compact" : ""}`}
      style={{ "--category-accent": presentation.accent } as React.CSSProperties}
    >
      <article className="card scenario-card">
        <div className="scenario-card-topline">
          <span className="category-pill">
            <CategoryIcon name={presentation.icon} />
            {presentation.label}
          </span>
          {scenario.is_living && <LivingWorldBadge />}
        </div>
        <h3>{scenario.title}</h3>
        <p className="premise">{scenario.premise}</p>
        <div className="scenario-card-footer">
          <span className="meta">
            {roles} role{roles === 1 ? "" : "s"}
            {scenario.tone ? ` · ${scenario.tone}` : ""}
          </span>
          <span className="scenario-action" aria-hidden="true">
            View Scenario
          </span>
        </div>
      </article>
    </Link>
  );
}

export { CategoryIcon };
