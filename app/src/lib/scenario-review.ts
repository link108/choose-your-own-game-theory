import type { ScenarioData } from "@/components/scenario/types";

export type ScenarioEditorTab = "world" | "actors" | "relationships" | "package" | "review";

export interface ScenarioReviewIssue {
  kind: "blocker" | "warning";
  source: "scenario" | "package_validation" | "package_diagnostics";
  category:
    | "launch_setup"
    | "package_validity"
    | "runtime_risks"
    | "authoring_quality";
  message: string;
}

export interface ScenarioPackageReviewResult {
  valid: boolean;
  issues: Array<{
    severity: "error" | "warning";
    path: string;
    message: string;
  }>;
  diagnostics: Array<{
    severity: "warning";
    code: string;
    path: string;
    message: string;
    recommendation?: string;
  }>;
}

export interface ScenarioLaunchReadiness {
  ready: boolean;
  blockers: ScenarioReviewIssue[];
  warnings: ScenarioReviewIssue[];
}

export interface ScenarioReviewSection {
  id: ScenarioReviewIssue["category"];
  title: string;
  description: string;
  suggestedTab: ScenarioEditorTab;
  blockers: ScenarioReviewIssue[];
  warnings: ScenarioReviewIssue[];
}

export interface ScenarioReviewScore {
  score: number;
  label: "Needs Work" | "Almost Ready" | "Ready With Warnings" | "Launch Ready";
}

export function buildScenarioLaunchReadiness(
  scenario: ScenarioData,
  packageReview: ScenarioPackageReviewResult | null
): ScenarioLaunchReadiness {
  const blockers: ScenarioReviewIssue[] = [];
  const warnings: ScenarioReviewIssue[] = [];

  const playerActors = scenario.actors.filter((actor) => actor.isPlayer);
  const nonPlayerActors = scenario.actors.filter((actor) => !actor.isPlayer);

  if (playerActors.length === 0) {
    blockers.push({
      kind: "blocker",
      source: "scenario",
      category: "launch_setup",
      message: "No player character assigned.",
    });
  }

  if (playerActors.length > 1) {
    blockers.push({
      kind: "blocker",
      source: "scenario",
      category: "launch_setup",
      message: "Multiple player characters are assigned. Only one player actor is allowed.",
    });
  }

  if (nonPlayerActors.length === 0) {
    blockers.push({
      kind: "blocker",
      source: "scenario",
      category: "launch_setup",
      message: "At least one non-player actor is required.",
    });
  }

  if (!scenario.description.trim()) {
    blockers.push({
      kind: "blocker",
      source: "scenario",
      category: "launch_setup",
      message: "Scenario description is empty.",
    });
  }

  if (!scenario.worldDescription.trim()) {
    warnings.push({
      kind: "warning",
      source: "scenario",
      category: "authoring_quality",
      message: "World description is empty. Reviewers and draft prompts will have less context.",
    });
  }

  if (scenario.actors.some((actor) => !actor.name.trim())) {
    blockers.push({
      kind: "blocker",
      source: "scenario",
      category: "launch_setup",
      message: "Some actors are missing names.",
    });
  }

  if (scenario.scenarioPackage === null) {
    blockers.push({
      kind: "blocker",
      source: "scenario",
      category: "package_validity",
      message: "No scenario package is attached. Sessions cannot start without a valid package.",
    });
  }

  if (packageReview) {
    for (const issue of packageReview.issues) {
      if (issue.severity === "error") {
        blockers.push({
          kind: "blocker",
          source: "package_validation",
          category: "package_validity",
          message: `${issue.path}: ${issue.message}`,
        });
      } else {
        warnings.push({
          kind: "warning",
          source: "package_validation",
          category: "package_validity",
          message: `${issue.path}: ${issue.message}`,
        });
      }
    }

    for (const diagnostic of packageReview.diagnostics) {
      warnings.push({
        kind: "warning",
        source: "package_diagnostics",
        category: getDiagnosticCategory(diagnostic.code),
        message: diagnostic.recommendation
          ? `${diagnostic.message} ${diagnostic.recommendation}`
          : diagnostic.message,
      });
    }
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
  };
}

export function buildScenarioReviewSections(
  readiness: ScenarioLaunchReadiness
): ScenarioReviewSection[] {
  const sectionMeta: Array<{
    id: ScenarioReviewSection["id"];
    title: string;
    description: string;
    suggestedTab: ScenarioEditorTab;
  }> = [
    {
      id: "launch_setup",
      title: "Launch Setup",
      description: "Core scenario requirements that must be true before a session can start.",
      suggestedTab: "world",
    },
    {
      id: "package_validity",
      title: "Package Validity",
      description: "Schema and reference correctness checks for the attached scenario package.",
      suggestedTab: "package",
    },
    {
      id: "runtime_risks",
      title: "Runtime Risks",
      description: "Signals that the package may degrade or behave weakly during live turns.",
      suggestedTab: "package",
    },
    {
      id: "authoring_quality",
      title: "Authoring Quality",
      description: "Quality improvements that can make the package clearer and easier to review.",
      suggestedTab: "package",
    },
  ];

  return sectionMeta.map((meta) => ({
    ...meta,
    blockers: readiness.blockers.filter((issue) => issue.category === meta.id),
    warnings: readiness.warnings.filter((issue) => issue.category === meta.id),
  }));
}

export function buildScenarioReviewScore(
  readiness: ScenarioLaunchReadiness
): ScenarioReviewScore {
  const blockerPenalty = readiness.blockers.length * 25;
  const warningPenalty = readiness.warnings.length * 5;
  const score = Math.max(0, 100 - blockerPenalty - warningPenalty);

  if (readiness.blockers.length > 0) {
    return {
      score,
      label: "Needs Work",
    };
  }

  if (readiness.warnings.length >= 4) {
    return {
      score,
      label: "Almost Ready",
    };
  }

  if (readiness.warnings.length > 0) {
    return {
      score,
      label: "Ready With Warnings",
    };
  }

  return {
    score,
    label: "Launch Ready",
  };
}

function getDiagnosticCategory(
  code: string
): ScenarioReviewIssue["category"] {
  switch (code) {
    case "no_effect_definitions":
    case "effect_has_no_operations":
    case "actor_capabilities_missing":
    case "actor_capability_missing_for_actor":
    case "actor_capability_has_no_effects":
    case "effect_not_referenced_by_policy_or_capabilities":
    case "trigger_rule_has_no_target":
    case "trigger_rule_has_no_comparator":
    case "trigger_rule_object_missing_field":
      return "runtime_risks";
    case "choice_policy_has_no_preferred_effects":
    case "hidden_object_has_no_visible_fields":
      return "authoring_quality";
    default:
      return "authoring_quality";
  }
}
