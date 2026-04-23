import type {
  ScenarioState,
  TurnResult,
  Choice,
  StateChange,
  GameEvent,
  PageData,
  ResolverSummary,
  ResolverDebug,
  RuntimeAlert,
  StructuredNarrative,
} from "@/lib/types";
import type {
  OperationDefinition,
  ScenarioEffectInvocation,
  ScenarioPackage,
  TriggerRule,
} from "@/lib/scenario-dsl";
import {
  applyScenarioOperations,
  expandScenarioEffect,
} from "@/lib/scenario-dsl";
import { cloneState } from "./state";
import {
  buildGroundedPageTitle,
  buildNarrationGrounding,
} from "./narrative-grounding";
import type { NarrationGrounding } from "./narrative-grounding";
import { buildRuntimeAlertFromCode } from "@/lib/runtime-feedback";
import type { ProposedStateChange } from "./proposals/types";
import {
  getLLMActorResponsesWithScenarioEffects,
  getLLMChoiceScenarioEffects,
  getLLMNarrative,
  getLLMChoices,
  getLLMInitialPage,
} from "../llm/game-llm";

/**
 * Extended turn result with proposal data.
 */
export interface TurnResultWithProposals extends TurnResult {
  proposals?: {
    choiceProposals: ProposedStateChange[];
    actorProposals: Array<{ actorId: string; proposals: ProposedStateChange[] }>;
  };
}

export interface GeneratedPageResult {
  page: PageData;
  runtimeAlerts: RuntimeAlert[];
  narrationSource: "llm" | "fallback";
}

/**
 * Configuration passed to the turn resolver.
 */
export interface TurnResolverConfig {
  scenarioPackage: ScenarioPackage;
}

export interface ScenarioEffectResolutionResult {
  newState: ScenarioState;
  stateChanges: StateChange[];
  events: GameEvent[];
  appliedInvocations: Array<{
    invocation: ScenarioEffectInvocation;
    operations: OperationDefinition[];
  }>;
  rejectedInvocations: Array<{
    invocation: ScenarioEffectInvocation;
    reason: string;
  }>;
  rejectedOperations: Array<{
    invocation: ScenarioEffectInvocation;
    operation: OperationDefinition;
    reason: string;
  }>;
}

/**
 * Resolve a single turn of the simulation.
 *
 * Runtime selection:
 * Only the scenario-package pipeline is supported.
 */
export async function resolveTurn(
  state: ScenarioState,
  playerChoice: Choice,
  availableChoices: Choice[],
  config?: TurnResolverConfig
): Promise<TurnResultWithProposals> {
  // 1. Validate player choice
  const isValidChoice = availableChoices.some((c) => c.id === playerChoice.id);
  if (!isValidChoice) {
    throw new Error(`Invalid choice: "${playerChoice.id}" is not available`);
  }

  if (!config?.scenarioPackage) {
    throw new Error(
      "Scenario package is required for turn resolution. Legacy runtime paths have been removed."
    );
  }

  return resolveTurnWithScenarioPackage(state, playerChoice, config.scenarioPackage);
}

export function resolveScenarioEffectInvocations(
  state: ScenarioState,
  scenarioPackage: ScenarioPackage,
  invocations: ScenarioEffectInvocation[],
  options?: {
    advanceTurn?: boolean;
    reasonPrefix?: string;
  }
): ScenarioEffectResolutionResult {
  const newState = cloneState(state);
  if (options?.advanceTurn ?? true) {
    newState.turn = state.turn + 1;
  }

  const stateChanges: StateChange[] = [];
  const events: GameEvent[] = [];
  const appliedInvocations: Array<{
    invocation: ScenarioEffectInvocation;
    operations: OperationDefinition[];
  }> = [];
  const rejectedInvocations: Array<{
    invocation: ScenarioEffectInvocation;
    reason: string;
  }> = [];
  const rejectedOperations: Array<{
    invocation: ScenarioEffectInvocation;
    operation: OperationDefinition;
    reason: string;
  }> = [];

  for (const invocation of invocations) {
    const expansion = expandScenarioEffect(newState, scenarioPackage, invocation);
    if (expansion.rejected) {
      rejectedInvocations.push({
        invocation,
        reason: expansion.rejected,
      });
      continue;
    }

    const applyResult = applyScenarioOperations(newState, expansion.operations, {
      turn: newState.turn,
      reason:
        options?.reasonPrefix != null
          ? `${options.reasonPrefix}: ${invocation.effectId}`
          : `Effect: ${invocation.effectId}`,
    });

    stateChanges.push(...applyResult.stateChanges);
    events.push(...applyResult.events);
    appliedInvocations.push({
      invocation,
      operations: expansion.operations,
    });
    rejectedOperations.push(
      ...applyResult.rejectedOperations.map((item) => ({
        invocation,
        operation: item.operation,
        reason: item.reason,
      }))
    );
  }

  return {
    newState,
    stateChanges,
    events,
    appliedInvocations,
    rejectedInvocations,
    rejectedOperations,
  };
}

async function resolveTurnWithScenarioPackage(
  state: ScenarioState,
  playerChoice: Choice,
  scenarioPackage: ScenarioPackage
): Promise<TurnResultWithProposals> {
  const explicitChoiceInvocation =
    playerChoice.execution?.kind === "scenario_effect"
      ? playerChoice.execution.invocation
      : null;
  const choiceExecutionMode = explicitChoiceInvocation
    ? "structured"
    : "interpreted_text";
  const choiceEffectSource = explicitChoiceInvocation
    ? "structured_metadata"
    : "llm";

  const [choiceEffectResult, actorResult] = await Promise.all([
    explicitChoiceInvocation
      ? Promise.resolve({
          effects: [explicitChoiceInvocation],
          llmFailed: false,
        })
      : getLLMChoiceScenarioEffects(state, playerChoice, scenarioPackage)
          .then((effects) => ({ effects, llmFailed: false }))
          .catch((err) => {
            console.warn("[engine] Choice scenario effects LLM call failed:", err);
            return {
              effects: [] as ScenarioEffectInvocation[],
              llmFailed: true,
            };
          }),
    getLLMActorResponsesWithScenarioEffects(state, playerChoice, scenarioPackage)
      .then((data) => ({ data, llmFailed: false }))
      .catch((err) => {
        console.warn("[engine] Actor scenario effect LLM calls failed:", err);
        return {
          data: [] as Awaited<ReturnType<typeof getLLMActorResponsesWithScenarioEffects>>,
          llmFailed: true,
        };
      }),
  ]);

  const choiceEffects = choiceEffectResult.effects;
  const actorData = actorResult.data;
  const actorEffects = actorData.flatMap((actor) => actor.effects);
  const allInvocations = [...choiceEffects, ...actorEffects];
  const resolution = resolveScenarioEffectInvocations(
    state,
    scenarioPackage,
    allInvocations,
    {
      advanceTurn: true,
      reasonPrefix: "Effect",
    }
  );

  const newState = resolution.newState;
  const countdownChanges = applyPerTurnWorldVariableBehavior(newState);
  const triggerResolution = applyScenarioTriggerRules(newState, scenarioPackage);
  const stateChanges = [
    ...resolution.stateChanges,
    ...countdownChanges,
    ...triggerResolution.stateChanges,
  ];
  const runtimeNote = getScenarioPackageRuntimeNote({
    choiceEffectSource,
    choiceLlmFailed: choiceEffectResult.llmFailed,
    actorLlmFailed: actorResult.llmFailed,
    totalInvocations: allInvocations.length,
    appliedInvocations: resolution.appliedInvocations.length,
    rejectedInvocations:
      resolution.rejectedInvocations.length + resolution.rejectedOperations.length,
    triggerRulesApplied: triggerResolution.appliedRuleIds.length,
    stateChanges: stateChanges.length,
  });
  if (runtimeNote) {
    console.warn(`[engine] Scenario package runtime note: ${runtimeNote}`);
  }

  const actorResponses = actorData.map((actor) => ({
    actorId: actor.actorId,
    actorName: actor.actorName,
    action: actor.action,
    reasoning: actor.reasoning,
    proposedChanges: [] as StateChange[],
  }));

  const events = generateEventsFromScenarioEffects(
    state,
    playerChoice,
    actorResponses,
    resolution,
    triggerResolution.events,
    stateChanges
  );
  newState.eventHistory = [...state.eventHistory, ...events];

  const resolverSummary: ResolverSummary = {
    effectsApplied: resolution.appliedInvocations.map(
      (item) => `${item.invocation.effectId} (${item.invocation.intensity})`
    ),
    clamped: [],
    rejected: [
      ...resolution.rejectedInvocations.map((item) => item.invocation.effectId),
      ...resolution.rejectedOperations.map((item) => item.invocation.effectId),
    ],
    runtimePath: "scenario_package",
    ...(runtimeNote ? { runtimeNote } : {}),
  };

  const resolverDebug: ResolverDebug = {
    runtime: {
      path: "scenario_package",
      ...(runtimeNote ? { note: runtimeNote } : {}),
    },
    effectsReceived: allInvocations.map((effect) => ({
      type: effect.effectId,
      intensity: effect.intensity,
      ...(explicitChoiceInvocation &&
      effect.effectId === explicitChoiceInvocation.effectId &&
      effect.bindings === explicitChoiceInvocation.bindings
        ? { scope: "player_choice_metadata" }
        : {}),
    })),
    effectsApplied: resolution.appliedInvocations.map((item) => ({
      effect: {
        type: item.invocation.effectId,
        intensity: item.invocation.intensity,
      },
      warnings: [],
      clamped: false,
    })),
    effectsRejected: [
      ...resolution.rejectedInvocations.map((item) => ({
        effect: { type: item.invocation.effectId, intensity: item.invocation.intensity },
        reason: item.reason,
      })),
      ...resolution.rejectedOperations.map((item) => ({
        effect: { type: item.invocation.effectId, intensity: item.invocation.intensity },
        reason: item.reason,
      })),
    ],
    constraintsApplied: triggerResolution.appliedRuleIds.map(
      (ruleId) => `trigger:${ruleId}`
    ),
    choiceExecution: {
      choiceId: playerChoice.id,
      text: playerChoice.text,
      ...(playerChoice.source ? { source: playerChoice.source } : {}),
      mode: choiceExecutionMode,
      effects: choiceEffects.map((effect) => ({
        effectId: effect.effectId,
        intensity: effect.intensity,
        bindings: effect.bindings,
      })),
      ...(playerChoice.debugReasoning
        ? { debugReasoning: playerChoice.debugReasoning }
        : {}),
      ...((playerChoice.debugReasoningSource ?? playerChoice.source) &&
      playerChoice.debugReasoning
        ? {
            debugReasoningSource:
              playerChoice.debugReasoningSource ?? playerChoice.source,
          }
        : {}),
    },
  };

  return {
    turn: newState.turn,
    playerChoice: { id: playerChoice.id, text: playerChoice.text },
    stateChanges,
    events,
    actorResponses,
    newState,
    resolverSummary,
    resolverDebug,
  };
}

/**
 * Generate a page for the given turn result.
 */
export async function generatePage(
  turnResult: TurnResult,
  previousState: ScenarioState,
  previousChoices?: Choice[],
  scenarioPackage?: ScenarioPackage,
  suggestedAction?: string
): Promise<GeneratedPageResult> {
  const { newState, playerChoice } = turnResult;
  const narrationGrounding = buildNarrationGrounding(previousState, turnResult);
  const runtimeAlerts: RuntimeAlert[] = [];

  let narrationSource: "llm" | "fallback" = "llm";
  let narrative: StructuredNarrative;
  try {
    narrative = await getLLMNarrative(narrationGrounding);
  } catch (error) {
    console.warn("[engine] Narrative generation failed; using fallback narrative:", error);
    narrationSource = "fallback";
    narrative = buildFallbackNarrative(narrationGrounding);
    runtimeAlerts.push(buildRuntimeAlertFromCode("page_narration_generation_failed"));
  }

  // Get choices via LLM
  const choices = await getLLMChoices(
    newState,
    playerChoice,
    {
      previousChoices: [
        ...(previousChoices ?? []),
        {
          id: playerChoice.id,
          text: playerChoice.text,
          description: playerChoice.text,
        },
      ],
      scenarioPackage,
      suggestedAction,
    }
  );

  const title = buildGroundedPageTitle(narrationGrounding);
  const stateSummary = narrationGrounding.stateSummary;

  return {
    page: {
      title,
      narrative,
      stateSummary,
      choices,
    },
    runtimeAlerts,
    narrationSource,
  };
}

/**
 * Generate the initial page for turn 0 (game start).
 */
export async function generateInitialPage(
  state: ScenarioState
): Promise<PageData> {
  return getLLMInitialPage(state);
}

// --- Internal helpers ---

function getScenarioPackageRuntimeNote(options: {
  choiceEffectSource: "structured_metadata" | "llm";
  choiceLlmFailed: boolean;
  actorLlmFailed: boolean;
  totalInvocations: number;
  appliedInvocations: number;
  rejectedInvocations: number;
  triggerRulesApplied: number;
  stateChanges: number;
}): string | undefined {
  if (options.appliedInvocations === 0 && options.rejectedInvocations > 0) {
    return "scenario_package_all_invocations_rejected";
  }

  if (options.totalInvocations === 0) {
    if (
      options.choiceEffectSource === "llm" &&
      options.choiceLlmFailed &&
      options.actorLlmFailed
    ) {
      return "scenario_package_llm_generation_failed";
    }
    if (options.choiceEffectSource === "llm" && options.choiceLlmFailed) {
      return "scenario_package_choice_generation_failed";
    }
    if (options.actorLlmFailed) {
      return "scenario_package_actor_generation_failed";
    }
    if (options.triggerRulesApplied === 0 && options.stateChanges === 0) {
      return "scenario_package_no_invocations_generated";
    }
  }

  return undefined;
}

export function buildFallbackNarrative(
  grounding: NarrationGrounding
): StructuredNarrative {
  const visibleChanges = grounding.visibleStateChanges.slice(0, 3);
  const visibleEvents = grounding.visibleEvents.slice(0, 2);
  const actorActions = grounding.actorActions.slice(0, 3);

  const consequences =
    visibleChanges.length > 0
      ? visibleChanges
          .map(
            (change) =>
              `- ${change.target}: ${formatNarrativeValue(change.oldValue)} -> ${formatNarrativeValue(change.newValue)}`
          )
          .join("\n")
      : "No visible state changes were committed.";

  const otherActions = actorActions.map((action, index) => ({
    actor: action.actorName,
    description: action.action,
    order: index + 1,
  }));

  const worldUpdate =
    visibleEvents.length > 0
      ? visibleEvents.map((event) => `- ${event.description}`).join("\n")
      : grounding.resolverSummary?.runtimeNote
        ? `Runtime note: ${grounding.resolverSummary.runtimeNote}`
        : "";

  return {
    playerAction: grounding.playerChoice.text,
    consequences,
    otherActions,
    worldUpdate,
  };
}

function generateEventsFromScenarioEffects(
  previousState: ScenarioState,
  playerChoice: Choice,
  actorResponses: { actorName: string; action: string }[],
  resolution: ScenarioEffectResolutionResult,
  triggerEvents: GameEvent[],
  stateChanges: StateChange[]
): GameEvent[] {
  const events: GameEvent[] = [];
  const turn = previousState.turn + 1;

  const choiceType = inferEventType(playerChoice.text);
  events.push({
    id: `event_${turn}_player`,
    turn,
    type: choiceType,
    description: `You decided to ${playerChoice.text.toLowerCase()}.`,
    involvedActors: [previousState.actors.find((a) => a.isPlayer)?.id ?? ""],
  });

  for (const response of actorResponses) {
    events.push({
      id: `event_${turn}_${response.actorName.replace(/\s+/g, "_").toLowerCase()}`,
      turn,
      type: inferEventType(response.action),
      description: response.action,
      involvedActors: [response.actorName],
    });
  }

  for (const item of resolution.appliedInvocations) {
    if (
      item.invocation.intensity === "moderate" ||
      item.invocation.intensity === "major"
    ) {
      events.push({
        id: `event_${turn}_effect_${item.invocation.effectId}`
          .toLowerCase()
          .replace(/\s+/g, "_"),
        turn,
        type: item.invocation.effectId,
        description: `${item.invocation.effectId.replace(/_/g, " ")} (${item.invocation.intensity})`,
        involvedActors: [],
      });
    }
  }

  events.push(...resolution.events, ...triggerEvents);

  const significantChanges = stateChanges.filter((c) => {
    if (c.type !== "resource") return false;
    const delta =
      typeof c.newValue === "number" && typeof c.oldValue === "number"
        ? Math.abs(c.newValue - c.oldValue)
        : 0;
    return delta >= 20;
  });

  for (const change of significantChanges) {
    events.push({
      id: `event_${turn}_change_${change.target}_${change.field}`
        .toLowerCase()
        .replace(/\s+/g, "_"),
      turn,
      type: "resource_shift",
      description: `${change.target}'s ${change.field} changed significantly: ${change.oldValue} → ${change.newValue}`,
      involvedActors: [change.target],
    });
  }

  return events;
}

function formatNarrativeValue(value: string | number): string {
  return typeof value === "number" ? String(value) : value;
}

function applyPerTurnWorldVariableBehavior(state: ScenarioState): StateChange[] {
  const stateChanges: StateChange[] = [];

  for (const v of state.worldVariables) {
    if (v.kind === "countdown" || v.kind === "counter") {
      const val = parseInt(v.value);
      if (isNaN(val)) continue;
      const step = (v.config as { step?: number } | null | undefined)?.step ?? 1;
      const isCountdown = v.kind === "countdown";
      const newVal = isCountdown ? Math.max(0, val - step) : val + step;
      if (newVal !== val) {
        const oldVal = v.value;
        v.value = String(newVal);
        stateChanges.push({
          type: "worldVariable",
          target: v.name,
          field: "value",
          oldValue: oldVal,
          newValue: v.value,
          reason: isCountdown ? "Countdown" : "Counter",
        });
      }
    }
  }

  return stateChanges;
}

function applyScenarioTriggerRules(
  state: ScenarioState,
  scenarioPackage: ScenarioPackage
): {
  stateChanges: StateChange[];
  events: GameEvent[];
  appliedRuleIds: string[];
} {
  const stateChanges: StateChange[] = [];
  const events: GameEvent[] = [];
  const appliedRuleIds: string[] = [];

  for (const rule of scenarioPackage.triggerRules ?? []) {
    if (rule.once) {
      const alreadyApplied = state.eventHistory.some(
        (event) =>
          event.type === "trigger_rule" &&
          event.description === `Trigger rule fired: ${rule.id}`
      );
      if (alreadyApplied) continue;
    }

    if (!matchesTriggerRule(state, rule)) continue;

    const result = applyScenarioOperations(state, rule.operations, {
      turn: state.turn,
      reason: `Trigger: ${rule.id}`,
    });

    stateChanges.push(...result.stateChanges);
    events.push(...result.events);
    events.push({
      id: `event_${state.turn}_trigger_${rule.id}`.toLowerCase(),
      turn: state.turn,
      type: "trigger_rule",
      description: `Trigger rule fired: ${rule.id}`,
      involvedActors: [],
    });
    appliedRuleIds.push(rule.id);
  }

  return {
    stateChanges,
    events,
    appliedRuleIds,
  };
}

function matchesTriggerRule(
  state: ScenarioState,
  rule: TriggerRule
): boolean {
  const condition = rule.when;

  if (condition.worldVariable) {
    const variable = state.worldVariables.find(
      (item) => item.id === condition.worldVariable
    );
    if (!variable) return false;
    if (condition.equals !== undefined) {
      return String(condition.equals) === variable.value;
    }
    const numericValue = Number(variable.value);
    if (!Number.isFinite(numericValue)) return false;
    if (condition.lte !== undefined && !(numericValue <= condition.lte)) return false;
    if (condition.gte !== undefined && !(numericValue >= condition.gte)) return false;
    return condition.lte !== undefined || condition.gte !== undefined;
  }

  if (condition.object && condition.field) {
    const object = state.scenarioObjects?.find((item) => item.id === condition.object);
    if (!object) return false;
    const fieldValue = object.fields[condition.field];
    if (fieldValue === undefined) return false;
    if (condition.equals !== undefined) {
      return fieldValue === condition.equals;
    }
    if (typeof fieldValue !== "number") return false;
    if (condition.lte !== undefined && !(fieldValue <= condition.lte)) return false;
    if (condition.gte !== undefined && !(fieldValue >= condition.gte)) return false;
    return condition.lte !== undefined || condition.gte !== undefined;
  }

  return false;
}

function inferEventType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("negotiate") || lower.includes("diplomat") || lower.includes("talk")) return "negotiation";
  if (lower.includes("trade") || lower.includes("offer") || lower.includes("exchange")) return "trade";
  if (lower.includes("attack") || lower.includes("pressure") || lower.includes("mobiliz")) return "conflict";
  if (lower.includes("fortify") || lower.includes("defend") || lower.includes("secure")) return "defense";
  if (lower.includes("intel") || lower.includes("scout") || lower.includes("spy")) return "intelligence";
  return "action";
}
