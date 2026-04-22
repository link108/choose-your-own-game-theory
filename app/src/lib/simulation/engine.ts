import type {
  ScenarioState,
  TurnResult,
  Choice,
  StateChange,
  GameEvent,
  PageData,
  ResolverSummary,
  ResolverDebug,
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
import { cloneState, applyChanges, applyDelta } from "./state";
import {
  buildGroundedPageTitle,
  buildNarrationGrounding,
} from "./narrative-grounding";
import {
  validateStateChanges,
  validateEntityReferences,
} from "./validation";
import {
  resolveEffects,
  resolveProposals,
  validateEffects,
  getRuleset,
  getConstraints,
} from "./resolver";
import type { SemanticEffect, ResolverResult, ProposalResolverResult } from "./resolver";
import type { ProposedStateChange, ScenarioPromptConfig, ActorResponseConfig } from "./proposals";
import { parsePromptConfig, parseActorResponseConfig } from "./proposals";
import {
  getLLMActorResponses,
  getLLMActorResponsesWithEffects,
  getLLMActorResponsesWithProposals,
  getLLMActorResponsesWithScenarioEffects,
  getLLMChoiceEffects,
  getLLMChoiceProposals,
  getLLMChoiceScenarioEffects,
  getLLMWorldUpdate,
  getLLMNarrative,
  getLLMChoices,
  getLLMInitialPage,
} from "../llm/game-llm";
import type { ProposalLLMConfig } from "../llm/game-llm";

/**
 * Extended turn result with proposal data.
 */
export interface TurnResultWithProposals extends TurnResult {
  proposals?: {
    choiceProposals: ProposedStateChange[];
    actorProposals: Array<{ actorId: string; proposals: ProposedStateChange[] }>;
  };
}

/**
 * Configuration passed to the turn resolver.
 */
export interface TurnResolverConfig {
  resolverConfig?: unknown;
  promptConfig?: unknown;
  actorResponseConfigs?: Map<string, unknown>;
  scenarioPackage?: ScenarioPackage;
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
 * Pipeline selection:
 * 1. If scenarioPackage is present → use scenario package effect pipeline
 * 2. If promptConfig is present → use proposal pipeline (new system)
 * 3. If resolverConfig is present → use SemanticEffect pipeline
 * 4. Otherwise → use legacy direct-delta pipeline
 */
export async function resolveTurn(
  state: ScenarioState,
  playerChoice: Choice,
  availableChoices: Choice[],
  scenarioResolverConfig?: unknown,
  config?: TurnResolverConfig
): Promise<TurnResultWithProposals> {
  // 1. Validate player choice
  const isValidChoice = availableChoices.some((c) => c.id === playerChoice.id);
  if (!isValidChoice) {
    throw new Error(`Invalid choice: "${playerChoice.id}" is not available`);
  }

  // Parse configs
  const promptConfig = parsePromptConfig(config?.promptConfig);
  const actorResponseConfigs = config?.actorResponseConfigs
    ? new Map(
        Array.from(config.actorResponseConfigs.entries())
          .map(([id, raw]) => [id, parseActorResponseConfig(raw)] as [string, ActorResponseConfig | null])
          .filter(([, c]) => c !== null) as [string, ActorResponseConfig][]
      )
    : undefined;

  // Route to appropriate pipeline
  if (config?.scenarioPackage) {
    return resolveTurnWithScenarioPackage(state, playerChoice, config.scenarioPackage);
  }

  if (promptConfig) {
    // New proposal pipeline
    return resolveTurnWithProposals(state, playerChoice, promptConfig, actorResponseConfigs, scenarioResolverConfig);
  }

  if (scenarioResolverConfig != null) {
    // SemanticEffect pipeline
    return resolveTurnWithResolver(state, playerChoice, scenarioResolverConfig);
  }

  // Fallback: old direct-delta pipeline
  console.warn(
    "[engine] No resolverConfig on scenario — falling back to legacy numeric pipeline"
  );
  return resolveTurnLegacy(state, playerChoice);
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
    fallback:
      resolution.appliedInvocations.length === 0 &&
      (resolution.rejectedInvocations.length > 0 ||
        resolution.rejectedOperations.length > 0),
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

// ---------------------------------------------------------------------------
// Proposal pipeline (new system)
// ---------------------------------------------------------------------------

async function resolveTurnWithProposals(
  state: ScenarioState,
  playerChoice: Choice,
  promptConfig: ScenarioPromptConfig,
  actorResponseConfigs?: Map<string, ActorResponseConfig>,
  scenarioResolverConfig?: unknown
): Promise<TurnResultWithProposals> {
  const newState = cloneState(state);
  newState.turn = state.turn + 1;

  const constraints = getConstraints(scenarioResolverConfig);
  const llmConfig: ProposalLLMConfig = {
    promptConfig,
    actorResponseConfigs,
  };

  // 2. Get choice proposals + actor proposals in parallel
  const [choiceResult, actorData] = await Promise.all([
    getLLMChoiceProposals(state, playerChoice, llmConfig).catch((err) => {
      console.warn("[engine] Choice proposals LLM call failed:", err);
      return { proposals: [] };
    }),
    getLLMActorResponsesWithProposals(state, playerChoice, llmConfig).catch((err) => {
      console.warn("[engine] Actor proposals LLM calls failed:", err);
      return [];
    }),
  ]);

  // 3. Merge all proposals
  const allProposals: ProposedStateChange[] = [
    ...choiceResult.proposals,
    ...actorData.flatMap((a) => a.proposals),
  ];

  // 4. Resolve proposals
  const resolverResult: ProposalResolverResult = resolveProposals(
    allProposals,
    newState,
    constraints,
    promptConfig
  );

  if (resolverResult.rejectedProposals.length > 0) {
    console.warn(
      `[engine] ${resolverResult.rejectedProposals.length} proposal(s) rejected:`,
      resolverResult.rejectedProposals.map((r) => `${r.proposal.kind}: ${r.reason}`)
    );
  }

  // 5. Apply aggregated deltas to state
  const stateChanges: StateChange[] = [];
  for (const delta of resolverResult.aggregatedDeltas) {
    const change = applyDelta(newState, delta);
    if (change) stateChanges.push(change);
  }

  // 5b. Apply fact-set and type-set proposals directly
  for (const proposal of allProposals) {
    if (proposal.kind === 'world_fact_set') {
      const variable = newState.worldVariables.find((v) => v.id === proposal.variableId);
      if (variable) {
        const oldValue = variable.value;
        variable.value = String(proposal.value);
        stateChanges.push({
          type: 'worldVariable',
          target: variable.name,
          field: 'value',
          oldValue,
          newValue: variable.value,
          reason: proposal.reason,
        });
      }
    } else if (proposal.kind === 'relationship_type_set') {
      const rel = newState.relationships.find((r) => r.id === proposal.relationshipId);
      if (rel) {
        const oldType = rel.type;
        rel.type = proposal.newType;
        stateChanges.push({
          type: 'relationship',
          target: rel.id,
          field: 'type',
          oldValue: oldType,
          newValue: rel.type,
          reason: proposal.reason,
        });
      }
    }
  }

  // 6. Apply automatic per-turn variable behavior
  for (const v of newState.worldVariables) {
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

  // 7. Build resolver summary
  const resolverSummary: ResolverSummary = {
    effectsApplied: resolverResult.resolutions.map(
      (r) => `${r.proposal.kind} (${('intensity' in r.proposal) ? (r.proposal as { intensity: string }).intensity : 'set'})`
    ),
    clamped: [
      ...new Set(
        resolverResult.aggregatedDeltas
          .filter((d) => d.clampedFrom !== undefined)
          .map((d) => d.field)
      ),
    ],
    rejected: resolverResult.rejectedProposals.map((r) => r.proposal.kind),
    fallback: resolverResult.resolutions.length === 0 && resolverResult.rejectedProposals.length > 0,
    runtimePath: "proposal",
    ...(resolverResult.resolutions.length === 0 &&
    resolverResult.rejectedProposals.length > 0
      ? { runtimeNote: "proposal_pipeline_all_proposals_rejected" }
      : {}),
  };

  // 8. Build actor responses for TurnResult
  const actorResponses = actorData.map((a) => ({
    actorId: a.actorId,
    actorName: a.actorName,
    action: a.action,
    reasoning: a.reasoning,
    proposedChanges: [] as StateChange[],
  }));

  // 9. Generate events
  const events = generateEventsFromProposals(
    state,
    playerChoice,
    actorResponses,
    resolverResult,
    stateChanges
  );
  newState.eventHistory = [...state.eventHistory, ...events];

  // 10. Build debug info
  const resolverDebug: ResolverDebug = {
    runtime: {
      path: "proposal",
      ...(resolverResult.resolutions.length === 0 &&
      resolverResult.rejectedProposals.length > 0
        ? { note: "proposal_pipeline_all_proposals_rejected" }
        : {}),
    },
    effectsReceived: allProposals.map((p) => ({
      type: p.kind,
      intensity: ('intensity' in p) ? (p as { intensity: string }).intensity as 'minor' | 'moderate' | 'major' : 'major',
    })),
    effectsApplied: resolverResult.resolutions.map((r) => ({
      effect: {
        type: r.proposal.kind,
        intensity: ('intensity' in r.proposal) ? (r.proposal as { intensity: string }).intensity : 'set',
      },
      warnings: r.warnings,
      clamped: r.clamped,
    })),
    effectsRejected: resolverResult.rejectedProposals.map((r) => ({
      effect: { type: r.proposal.kind, intensity: 'unknown' },
      reason: r.reason,
    })),
    constraintsApplied: resolverResult.appliedConstraints,
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
    proposals: {
      choiceProposals: choiceResult.proposals,
      actorProposals: actorData.map((a) => ({ actorId: a.actorId, proposals: a.proposals })),
    },
  };
}

// ---------------------------------------------------------------------------
// Resolver pipeline (SemanticEffect - Project 7)
// ---------------------------------------------------------------------------

async function resolveTurnWithResolver(
  state: ScenarioState,
  playerChoice: Choice,
  scenarioResolverConfig: unknown
): Promise<TurnResult> {
  const newState = cloneState(state);
  newState.turn = state.turn + 1;

  const ruleset = getRuleset(scenarioResolverConfig);
  const constraints = getConstraints(scenarioResolverConfig);
  const validEffectTypes = Object.keys(ruleset);

  // 2. Get player choice effects + actor effects in parallel
  const [choiceEffects, actorData] = await Promise.all([
    getLLMChoiceEffects(state, playerChoice, validEffectTypes).catch((err) => {
      console.warn("[engine] Choice effects LLM call failed:", err);
      return [] as SemanticEffect[];
    }),
    getLLMActorResponsesWithEffects(state, playerChoice, validEffectTypes).catch(
      (err) => {
        console.warn("[engine] Actor effects LLM calls failed:", err);
        return [] as Awaited<ReturnType<typeof getLLMActorResponsesWithEffects>>;
      }
    ),
  ]);

  // 3. Merge all effects
  const actorEffects: SemanticEffect[] = actorData.flatMap((a) => a.effects);
  const allEffects: SemanticEffect[] = [...choiceEffects, ...actorEffects];

  // 4. Pre-validate then resolve
  const { valid: validEffects, rejected: preRejected } = validateEffects(allEffects, ruleset, constraints);
  if (preRejected.length > 0) {
    console.warn("[engine] Effect validation warnings:", preRejected);
  }

  const resolverResult: ResolverResult = resolveEffects(
    validEffects,
    newState,
    ruleset,
    constraints
  );

  if (resolverResult.rejectedEffects.length > 0) {
    console.warn(
      `[engine] ${resolverResult.rejectedEffects.length} effect(s) rejected:`,
      resolverResult.rejectedEffects.map((r) => `${r.effect.type}: ${r.reason}`)
    );
  }

  // 5. Detect full fallback (all effects rejected, nothing applied)
  const isFallback =
    resolverResult.resolutions.length === 0 &&
    resolverResult.rejectedEffects.length > 0;

  if (isFallback) {
    console.warn("[engine] All effects rejected — generating fallback turn");
  }

  // 6. Apply aggregatedDeltas to state
  const stateChanges: StateChange[] = [];
  for (const delta of resolverResult.aggregatedDeltas) {
    const change = applyDelta(newState, delta);
    if (change) stateChanges.push(change);
  }

  // 6b. Apply automatic per-turn variable behavior based on kind
  for (const v of newState.worldVariables) {
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

  // 7. Build resolver summary for narration
  const clampedFields = [
    ...new Set(
      resolverResult.aggregatedDeltas
        .filter((d) => d.clampedFrom !== undefined)
        .map((d) => d.field)
    ),
  ];

  const resolverSummary: ResolverSummary = {
    effectsApplied: resolverResult.resolutions.map(
      (r) => `${r.effect.type} (${r.effect.intensity})`
    ),
    clamped: clampedFields,
    rejected: resolverResult.rejectedEffects.map((r) => r.effect.type),
    fallback: isFallback,
    runtimePath: "resolver",
    ...(isFallback ? { runtimeNote: "resolver_pipeline_all_effects_rejected" } : {}),
  };

  // 8. Build actor responses for TurnResult (backward compat shape)
  const actorResponses = actorData.map((a) => ({
    actorId: a.actorId,
    actorName: a.actorName,
    action: a.action,
    reasoning: a.reasoning,
    proposedChanges: [] as StateChange[],
  }));

  // 9. Generate events
  const events = generateEventsFromResolver(
    state,
    playerChoice,
    actorResponses,
    resolverResult,
    stateChanges
  );
  newState.eventHistory = [...state.eventHistory, ...events];

  // 10. Build resolverDebug (populated regardless; API route guards by NODE_ENV)
  const resolverDebug: ResolverDebug = {
    runtime: {
      path: "resolver",
      ...(isFallback ? { note: "resolver_pipeline_all_effects_rejected" } : {}),
    },
    effectsReceived: allEffects,
    effectsApplied: resolverResult.resolutions.map((r) => ({
      effect: { type: r.effect.type, intensity: r.effect.intensity },
      warnings: r.warnings,
      clamped: r.clamped,
    })),
    effectsRejected: resolverResult.rejectedEffects.map((r) => ({
      effect: { type: r.effect.type, intensity: r.effect.intensity },
      reason: r.reason,
    })),
    constraintsApplied: resolverResult.appliedConstraints,
  };

  // 11. Persist resolverLog on Turn via return value (API route handles the write)
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

// ---------------------------------------------------------------------------
// Legacy pipeline (no resolverConfig)
// ---------------------------------------------------------------------------

async function resolveTurnLegacy(
  state: ScenarioState,
  playerChoice: Choice
): Promise<TurnResult> {
  const newState = cloneState(state);
  newState.turn = state.turn + 1;

  // Get actor responses via LLM
  const actorResponses = await getLLMActorResponses(state, playerChoice);

  // Collect resource changes from actor responses
  const resourceChanges: StateChange[] = actorResponses
    .flatMap((r) => r.proposedChanges)
    .filter((c) => c.type === "resource");

  // Validate and apply resource changes
  const refErrors = validateEntityReferences(state, resourceChanges);
  if (refErrors.length > 0) {
    console.warn("Entity reference errors:", refErrors);
  }

  const resourceValidation = validateStateChanges(state, resourceChanges);
  if (resourceValidation.warnings.length > 0) {
    console.warn("Resource validation warnings:", resourceValidation.warnings);
  }
  applyChanges(newState, resourceValidation.clampedChanges);

  // Get world state updates via dedicated LLM call
  let worldChanges: StateChange[] = [];
  try {
    worldChanges = await getLLMWorldUpdate(
      state,
      playerChoice,
      actorResponses,
      resourceValidation.clampedChanges
    );
  } catch (error) {
    console.warn("World update LLM call failed:", error);
  }

  const worldValidation = validateStateChanges(newState, worldChanges);
  if (worldValidation.warnings.length > 0) {
    console.warn("World validation warnings:", worldValidation.warnings);
  }
  applyChanges(newState, worldValidation.clampedChanges);

  // Apply automatic per-turn variable behavior based on kind
  const countdownChanges: StateChange[] = [];
  for (const v of newState.worldVariables) {
    if (v.kind === "countdown" || v.kind === "counter") {
      const val = parseInt(v.value);
      if (isNaN(val)) continue;
      const step = (v.config as { step?: number } | null | undefined)?.step ?? 1;
      const isCountdown = v.kind === "countdown";
      const newVal = isCountdown ? Math.max(0, val - step) : val + step;
      if (newVal !== val) {
        const oldVal = v.value;
        v.value = String(newVal);
        countdownChanges.push({
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

  const allChanges = [
    ...resourceValidation.clampedChanges,
    ...worldValidation.clampedChanges,
    ...countdownChanges,
  ];

  const events = generateEvents(state, playerChoice, actorResponses, allChanges);
  newState.eventHistory = [...state.eventHistory, ...events];

  return {
    turn: newState.turn,
    playerChoice: { id: playerChoice.id, text: playerChoice.text },
    stateChanges: allChanges,
    events,
    actorResponses,
    newState,
    resolverSummary: {
      effectsApplied: [],
      clamped: [],
      rejected: [],
      runtimePath: "legacy",
      runtimeNote: "legacy_pipeline_no_structured_runtime_config",
    },
    resolverDebug: {
      runtime: {
        path: "legacy",
        note: "legacy_pipeline_no_structured_runtime_config",
      },
      effectsReceived: [],
      effectsApplied: [],
      effectsRejected: [],
      constraintsApplied: [],
    },
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
): Promise<PageData> {
  const { newState, playerChoice } = turnResult;
  const narrationGrounding = buildNarrationGrounding(previousState, turnResult);

  // Get structured narrative via LLM
  const narrative = await getLLMNarrative(narrationGrounding);

  // Get choices via LLM
  const choices = await getLLMChoices(
    newState,
    playerChoice,
    previousChoices,
    scenarioPackage,
    suggestedAction
  );

  const title = buildGroundedPageTitle(narrationGrounding);
  const stateSummary = narrationGrounding.stateSummary;

  return {
    title,
    narrative,
    stateSummary,
    choices,
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

function generateEventsFromProposals(
  previousState: ScenarioState,
  playerChoice: Choice,
  actorResponses: { actorName: string; action: string }[],
  resolverResult: ProposalResolverResult,
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

  // Events from resolved proposals
  for (const resolution of resolverResult.resolutions) {
    const { proposal } = resolution;
    const hasIntensity = 'intensity' in proposal;
    if (hasIntensity) {
      const intensity = (proposal as { intensity: string }).intensity;
      if (intensity === "major" || intensity === "moderate") {
        events.push({
          id: `event_${turn}_proposal_${proposal.kind}`.toLowerCase().replace(/\s+/g, "_"),
          turn,
          type: proposal.kind,
          description: `${proposal.kind.replace(/_/g, " ")} (${intensity})`,
          involvedActors: [],
        });
      }
    }
  }

  // Significant numeric shifts
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

function generateEventsFromResolver(
  previousState: ScenarioState,
  playerChoice: Choice,
  actorResponses: { actorName: string; action: string }[],
  resolverResult: ResolverResult,
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

  // Events from resolved effect types
  for (const resolution of resolverResult.resolutions) {
    const { effect } = resolution;
    if (effect.intensity === "major" || effect.intensity === "moderate") {
      events.push({
        id: `event_${turn}_effect_${effect.type}`.toLowerCase().replace(/\s+/g, "_"),
        turn,
        type: effect.type,
        description: `${effect.type.replace(/_/g, " ")} (${effect.intensity})${effect.target ? ` affecting ${effect.target}` : ""}`,
        involvedActors: effect.target ? [effect.target] : [],
      });
    }
  }

  // Significant numeric shifts (same threshold as legacy)
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

function generateEvents(
  _previousState: ScenarioState,
  playerChoice: Choice,
  actorResponses: { actorName: string; action: string }[],
  stateChanges: StateChange[]
): GameEvent[] {
  const events: GameEvent[] = [];
  const turn = _previousState.turn + 1;

  const choiceType = inferEventType(playerChoice.text);
  events.push({
    id: `event_${turn}_player`,
    turn,
    type: choiceType,
    description: `You decided to ${playerChoice.text.toLowerCase()}.`,
    involvedActors: [_previousState.actors.find((a) => a.isPlayer)?.id ?? ""],
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
