import type { RuntimeAlert } from "@/lib/types";

export function buildRuntimeAlertFromCode(code: string): RuntimeAlert {
  switch (code) {
    case "scenario_package_all_invocations_rejected":
      return {
        code,
        stage: "turn_resolution",
        severity: "warning",
        summary: "All generated package invocations were rejected",
        detail:
          "The runtime produced candidate package effects, but validation rejected all of them before state updates were applied.",
        retryable: true,
      };
    case "scenario_package_llm_generation_failed":
      return {
        code,
        stage: "turn_resolution",
        severity: "warning",
        summary: "Choice and actor effect generation failed",
        detail:
          "LLM-dependent package effect generation failed for both the selected choice and actor responses during turn resolution.",
        retryable: true,
      };
    case "scenario_package_choice_generation_failed":
      return {
        code,
        stage: "turn_resolution",
        severity: "warning",
        summary: "Choice effect generation failed",
        detail:
          "The selected choice could not be translated into package effect invocations, so the turn relied on other available runtime inputs.",
        retryable: true,
      };
    case "scenario_package_actor_generation_failed":
      return {
        code,
        stage: "turn_resolution",
        severity: "warning",
        summary: "Actor effect generation failed",
        detail:
          "One or more actor response generations failed, so the turn resolved without the expected actor package effects.",
        retryable: true,
      };
    case "scenario_package_no_invocations_generated":
      return {
        code,
        stage: "turn_resolution",
        severity: "warning",
        summary: "No package invocations were generated",
        detail:
          "The runtime resolved the turn without any package effects or trigger rules producing state changes.",
        retryable: true,
      };
    case "page_narration_generation_failed":
      return {
        code,
        stage: "narration",
        severity: "warning",
        summary: "Narration fell back to deterministic rendering",
        detail:
          "Narrative generation failed, so the page was assembled from committed visible outcomes instead of LLM-written prose.",
        retryable: true,
      };
    case "page_choice_generation_failed":
      return {
        code,
        stage: "choice_generation",
        severity: "error",
        summary: "Next-choice generation failed",
        detail:
          "The turn resolved, but the system could not produce the next page of choices.",
        retryable: true,
      };
    case "choice_regeneration_failed":
      return {
        code,
        stage: "choice_regeneration",
        severity: "error",
        summary: "Choice regeneration failed",
        detail:
          "The system could not regenerate a fresh set of valid package-backed choices for the current page.",
        retryable: true,
      };
    case "initial_page_generation_failed":
      return {
        code,
        stage: "initial_page",
        severity: "error",
        summary: "Initial page generation failed",
        detail:
          "The session could not produce its first page, so play could not begin.",
        retryable: true,
      };
    default:
      return {
        code,
        stage: "turn_resolution",
        severity: "warning",
        summary: code,
        detail: code,
        retryable: true,
      };
  }
}

export function mergeRuntimeAlerts(
  existing: RuntimeAlert[] | undefined,
  next: RuntimeAlert[]
): RuntimeAlert[] {
  const merged: RuntimeAlert[] = [...(existing ?? [])];

  for (const alert of next) {
    if (merged.some((item) => item.code === alert.code)) {
      continue;
    }
    merged.push(alert);
  }

  return merged;
}
