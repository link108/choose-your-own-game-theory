import type {
  ScenarioState,
  ActorResponseData,
  StateChange,
  Choice,
  PageData,
  StructuredNarrative,
  ResolverSummary,
} from "@/lib/types";
import type {
  ScenarioEffectInvocation,
  ScenarioPackage,
} from "@/lib/scenario-dsl";
import type { SemanticEffect } from "../simulation/resolver";
import type {
  ProposedStateChange,
  ActorIntentProposal,
  ChoiceEffectsProposal,
  ScenarioPromptConfig,
  ActorResponseConfig,
} from "../simulation/proposals";
import {
  generateProposalSchema,
  parseActorResponseConfig,
} from "../simulation/proposals";
import { getLLMProvider, isLLMConfigured } from "./provider";
import {
  parseJSON,
  validateActorResponse,
  validateActorEffectsResponse,
  validateActorScenarioEffectsResponse,
  validateSemanticEffects,
  validateScenarioEffectInvocations,
  validateChoices,
  validateActorProposalResponse,
  validateChoiceProposalResponse,
} from "./parse";
import {
  buildActorReasoningPrompt,
  buildActorReasoningEffectsPrompt,
  buildActorReasoningProposalPrompt,
  buildActorReasoningScenarioEffectsPrompt,
} from "./prompts/actor-reasoning";
import { buildNarrationPrompt } from "./prompts/narration";
import { buildChoiceGenerationPrompt } from "./prompts/choices";
import { buildInitialPagePrompt } from "./prompts/initial-page";
import { buildWorldUpdatePrompt } from "./prompts/world-update";
import {
  buildChoiceEffectsPrompt,
  buildChoiceEffectsProposalPrompt,
  buildChoiceScenarioEffectsPrompt,
} from "./prompts/choice-effects";
import { getNonPlayerActors, getPlayerActor, buildStateSummary } from "../simulation/state";
import {
  getStubChoices,
  getStubInitialPage,
  getStubScenarioChoices,
} from "../simulation/stub-actors";
import {
  buildSuggestedChoice,
  validateGeneratedChoices,
} from "../simulation/choices/validation";

// ---------------------------------------------------------------------------
// Proposal-based LLM functions (new system)
// ---------------------------------------------------------------------------

export interface ProposalLLMConfig {
  promptConfig?: ScenarioPromptConfig | null;
  actorResponseConfigs?: Map<string, ActorResponseConfig>;
}

// ---------------------------------------------------------------------------
// Scenario package effect invocation LLM functions
// ---------------------------------------------------------------------------

export async function getLLMChoiceScenarioEffects(
  state: ScenarioState,
  playerChoice: { text: string },
  scenarioPackage: ScenarioPackage
): Promise<ScenarioEffectInvocation[]> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured");
  }

  const provider = getLLMProvider();
  const messages = buildChoiceScenarioEffectsPrompt(
    state,
    playerChoice,
    scenarioPackage
  );

  const raw = await provider.complete({
    messages,
    maxTokens: 768,
    temperature: 0.7,
  });

  const parsed = parseJSON(raw);
  const result = validateScenarioEffectInvocations(parsed, scenarioPackage);

  if (result.warnings?.length) {
    console.warn("[game-llm] Choice scenario effect warnings:", result.warnings);
  }

  return result.effects;
}

export async function getLLMActorResponsesWithScenarioEffects(
  state: ScenarioState,
  playerChoice: { id: string; text: string },
  scenarioPackage: ScenarioPackage
): Promise<
  Array<{
    actorId: string;
    actorName: string;
    action: string;
    reasoning: string;
    effects: ScenarioEffectInvocation[];
  }>
> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in .env");
  }

  const provider = getLLMProvider();
  const npcs = getNonPlayerActors(state);
  const recentEvents = state.eventHistory.slice(-5);

  const responses = await Promise.allSettled(
    npcs.map(async (npc) => {
      const allowedEffectIds = new Set(
        scenarioPackage.actorCapabilities?.find((capability) => capability.actorId === npc.id)
          ?.effectIds ?? scenarioPackage.effectDefinitions.map((effect) => effect.id)
      );

      const messages = buildActorReasoningScenarioEffectsPrompt(
        state,
        npc,
        playerChoice,
        recentEvents,
        scenarioPackage
      );

      const raw = await provider.complete({
        messages,
        maxTokens: 1024,
        temperature: 0.7,
      });

      const parsed = parseJSON(raw);
      const validated = validateActorScenarioEffectsResponse(
        parsed,
        scenarioPackage,
        allowedEffectIds
      );

      if (!validated) {
        throw new Error(`Invalid LLM response for ${npc.name}`);
      }

      if (validated.warnings?.length) {
        console.warn(
          `[game-llm] Actor ${npc.name} scenario effect warnings:`,
          validated.warnings
        );
      }

      return {
        actorId: npc.id,
        actorName: npc.name,
        action: validated.action,
        reasoning: validated.reasoning,
        effects: validated.effects,
      };
    })
  );

  const successful = responses
    .filter(
      (
        r
      ): r is PromiseFulfilledResult<{
        actorId: string;
        actorName: string;
        action: string;
        reasoning: string;
        effects: ScenarioEffectInvocation[];
      }> => r.status === "fulfilled"
    )
    .map((r) => r.value);

  const failed = responses.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(
      `${failed.length}/${responses.length} actor LLM calls failed:`,
      failed.map((r) => (r as PromiseRejectedResult).reason?.message)
    );
  }

  if (successful.length === 0 && npcs.length > 0) {
    throw new Error("All actor LLM calls failed. Check your API key and model configuration.");
  }

  return successful;
}

/**
 * Get ProposedStateChange[] for the player's choice (proposal pipeline).
 */
export async function getLLMChoiceProposals(
  state: ScenarioState,
  playerChoice: { text: string },
  config?: ProposalLLMConfig
): Promise<ChoiceEffectsProposal> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured");
  }

  const provider = getLLMProvider();
  const messages = buildChoiceEffectsProposalPrompt({
    state,
    playerChoice,
    promptConfig: config?.promptConfig,
  });

  const raw = await provider.complete({
    messages,
    maxTokens: 512,
    temperature: 0.7,
  });

  const parsed = parseJSON(raw);
  const proposalSchema = generateProposalSchema(state);
  const result = validateChoiceProposalResponse(parsed, proposalSchema);

  if (result.warnings?.length) {
    console.warn("[game-llm] Choice proposal validation warnings:", result.warnings);
  }

  return result.data ?? { proposals: [] };
}

/**
 * Get actor responses with proposals via LLM — proposal pipeline.
 */
export async function getLLMActorResponsesWithProposals(
  state: ScenarioState,
  playerChoice: { id: string; text: string },
  config?: ProposalLLMConfig
): Promise<Array<{ actorId: string; actorName: string } & ActorIntentProposal>> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured");
  }

  const provider = getLLMProvider();
  const npcs = getNonPlayerActors(state);
  const recentEvents = state.eventHistory.slice(-5);
  const proposalSchema = generateProposalSchema(state);

  const responses = await Promise.allSettled(
    npcs.map(async (npc) => {
      // Get actor-specific config if available
      const actorConfig = config?.actorResponseConfigs?.get(npc.id) ?? null;

      const messages = buildActorReasoningProposalPrompt({
        state,
        actor: npc,
        playerChoice,
        recentEvents,
        promptConfig: config?.promptConfig,
        actorConfig,
      });

      const raw = await provider.complete({
        messages,
        maxTokens: 1024,
        temperature: 0.7,
      });

      const parsed = parseJSON(raw);
      const result = validateActorProposalResponse(parsed, proposalSchema);

      if (!result.success || !result.data) {
        const errorMsg = result.errors?.map((e) => e.message).join(", ") ?? "Unknown error";
        throw new Error(`Invalid LLM response for ${npc.name}: ${errorMsg}`);
      }

      if (result.warnings?.length) {
        console.warn(`[game-llm] Actor ${npc.name} proposal warnings:`, result.warnings);
      }

      return {
        actorId: npc.id,
        actorName: npc.name,
        ...result.data,
      };
    })
  );

  const successful = responses
    .filter(
      (r): r is PromiseFulfilledResult<{ actorId: string; actorName: string } & ActorIntentProposal> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value);

  const failed = responses.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(
      `${failed.length}/${responses.length} actor LLM calls failed:`,
      failed.map((r) => (r as PromiseRejectedResult).reason?.message)
    );
  }

  if (successful.length === 0 && npcs.length > 0) {
    throw new Error("All actor LLM calls failed. Check your API key and model configuration.");
  }

  return successful;
}

// ---------------------------------------------------------------------------
// Legacy SemanticEffect LLM functions
// ---------------------------------------------------------------------------

/**
 * Get SemanticEffect[] for the player's choice (resolver pipeline).
 */
export async function getLLMChoiceEffects(
  state: ScenarioState,
  playerChoice: { text: string },
  validEffectTypes: string[]
): Promise<SemanticEffect[]> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured");
  }

  const provider = getLLMProvider();
  const messages = buildChoiceEffectsPrompt(state, playerChoice, validEffectTypes);

  const raw = await provider.complete({
    messages,
    maxTokens: 512,
    temperature: 0.7,
  });

  const parsed = parseJSON(raw);
  return validateSemanticEffects(parsed, new Set(validEffectTypes));
}

/**
 * Get actor responses (with SemanticEffects) via LLM — resolver pipeline.
 * Returns action/reasoning for narration plus effects for the resolver.
 */
export async function getLLMActorResponsesWithEffects(
  state: ScenarioState,
  playerChoice: { id: string; text: string },
  validEffectTypes: string[]
): Promise<Array<{ actorId: string; actorName: string; action: string; reasoning: string; effects: SemanticEffect[] }>> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in .env");
  }

  const provider = getLLMProvider();
  const npcs = getNonPlayerActors(state);
  const recentEvents = state.eventHistory.slice(-5);
  const effectTypeSet = new Set(validEffectTypes);

  const responses = await Promise.allSettled(
    npcs.map(async (npc) => {
      const messages = buildActorReasoningEffectsPrompt(
        state,
        npc,
        playerChoice,
        recentEvents,
        validEffectTypes
      );

      const raw = await provider.complete({
        messages,
        maxTokens: 1024,
        temperature: 0.7,
      });

      const parsed = parseJSON(raw);
      const validated = validateActorEffectsResponse(parsed, effectTypeSet);

      if (!validated) {
        throw new Error(`Invalid LLM response for ${npc.name}`);
      }

      return {
        actorId: npc.id,
        actorName: npc.name,
        action: validated.action,
        reasoning: validated.reasoning,
        effects: validated.effects,
      };
    })
  );

  const successful = responses
    .filter(
      (r): r is PromiseFulfilledResult<{ actorId: string; actorName: string; action: string; reasoning: string; effects: SemanticEffect[] }> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value);

  const failed = responses.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(
      `${failed.length}/${responses.length} actor LLM calls failed:`,
      failed.map((r) => (r as PromiseRejectedResult).reason?.message)
    );
  }

  if (successful.length === 0 && npcs.length > 0) {
    throw new Error("All actor LLM calls failed. Check your API key and model configuration.");
  }

  return successful;
}

/**
 * Get actor responses via LLM.
 */
export async function getLLMActorResponses(
  state: ScenarioState,
  playerChoice: { id: string; text: string }
): Promise<ActorResponseData[]> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY in .env");
  }

  const provider = getLLMProvider();
  const npcs = getNonPlayerActors(state);
  const player = getPlayerActor(state);
  if (!player) throw new Error("No player actor found");

  const recentEvents = state.eventHistory.slice(-5);

  const responses = await Promise.allSettled(
    npcs.map(async (npc) => {
      const messages = buildActorReasoningPrompt(
        state,
        npc,
        playerChoice,
        recentEvents
      );

      const raw = await provider.complete({
        messages,
        maxTokens: 1024,
        temperature: 0.7,
      });

      const parsed = parseJSON(raw);
      const validated = validateActorResponse(parsed);

      if (!validated) {
        throw new Error(`Invalid LLM response for ${npc.name}`);
      }

      const proposedChanges: StateChange[] = validated.stateChanges.map(
        (c) => {
          if (c.type === "worldVariable") {
            const variable = state.worldVariables.find(
              (v) => v.name === c.target
            );
            return {
              type: "worldVariable" as StateChange["type"],
              target: c.target,
              field: c.field || "value",
              oldValue: variable?.value ?? "",
              newValue: c.newValue ?? c.delta ?? 0,
              reason: c.reason || "LLM proposed world change",
            };
          }
          if (c.type === "resource" && c.delta !== undefined) {
            const targetActor = state.actors.find(
              (a) => a.name === c.target
            );
            const resource = targetActor?.resources.find(
              (r) => r.name === c.field
            );
            const oldValue = resource?.value ?? 0;
            return {
              type: "resource" as StateChange["type"],
              target: c.target,
              field: c.field,
              oldValue,
              newValue: oldValue + c.delta,
              reason: c.reason || "LLM proposed change",
            };
          }
          return {
            type: (c.type || "resource") as StateChange["type"],
            target: c.target,
            field: c.field || "value",
            oldValue: 0,
            newValue: c.newValue ?? 0,
            reason: c.reason || "LLM proposed change",
          };
        }
      );

      return {
        actorId: npc.id,
        actorName: npc.name,
        action: validated.action,
        reasoning: validated.reasoning,
        proposedChanges,
      };
    })
  );

  const successful = responses
    .filter((r): r is PromiseFulfilledResult<ActorResponseData> => r.status === "fulfilled")
    .map((r) => r.value);

  const failed = responses.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(`${failed.length}/${responses.length} actor LLM calls failed:`,
      failed.map((r) => (r as PromiseRejectedResult).reason?.message));
  }

  if (successful.length === 0) {
    throw new Error("All actor LLM calls failed. Check your API key and model configuration.");
  }

  return successful;
}

/**
 * Get world state updates via LLM.
 * This runs AFTER actor responses are resolved to determine how world variables
 * and relationships should change based on what happened.
 */
export async function getLLMWorldUpdate(
  state: ScenarioState,
  playerChoice: { text: string },
  actorResponses: ActorResponseData[],
  appliedResourceChanges: StateChange[]
): Promise<StateChange[]> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured");
  }

  const provider = getLLMProvider();
  const messages = buildWorldUpdatePrompt(
    state,
    playerChoice,
    actorResponses,
    appliedResourceChanges
  );

  const raw = await provider.complete({
    messages,
    maxTokens: 1024,
    temperature: 0.7,
  });

  const parsed = parseJSON<{
    worldVariableChanges?: Array<{ name: string; newValue: string; reason: string }>;
    relationshipChanges?: Array<{ fromActor: string; toActor: string; newStrength: number; reason: string }>;
  }>(raw);

  const changes: StateChange[] = [];

  // World variable changes
  if (Array.isArray(parsed.worldVariableChanges)) {
    for (const wc of parsed.worldVariableChanges) {
      if (!wc.name || wc.newValue === undefined) continue;
      const existing = state.worldVariables.find((v) => v.name === wc.name);
      if (!existing) continue;
      changes.push({
        type: "worldVariable",
        target: wc.name,
        field: "value",
        oldValue: existing.value,
        newValue: String(wc.newValue),
        reason: wc.reason || "World state update",
      });
    }
  }

  // Relationship changes
  if (Array.isArray(parsed.relationshipChanges)) {
    for (const rc of parsed.relationshipChanges) {
      if (!rc.fromActor || !rc.toActor || rc.newStrength === undefined) continue;
      const fromActor = state.actors.find((a) => a.name === rc.fromActor);
      const toActor = state.actors.find((a) => a.name === rc.toActor);
      if (!fromActor || !toActor) continue;
      const rel = state.relationships.find(
        (r) => r.fromActorId === fromActor.id && r.toActorId === toActor.id
      );
      if (!rel) continue;
      changes.push({
        type: "relationship",
        target: rc.fromActor,
        field: "strength",
        oldValue: rel.strength,
        newValue: Math.max(0, Math.min(100, rc.newStrength)),
        reason: rc.reason || "Relationship update",
      });
    }
  }

  return changes;
}

/**
 * Generate structured narrative via LLM.
 */
export async function getLLMNarrative(
  state: ScenarioState,
  playerChoice: { text: string },
  actorResponses: ActorResponseData[],
  stateChanges: StateChange[],
  resolverSummary?: ResolverSummary
): Promise<StructuredNarrative> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured");
  }

  const provider = getLLMProvider();
  const messages = buildNarrationPrompt(
    state,
    playerChoice,
    actorResponses,
    stateChanges,
    resolverSummary
  );

  const raw = await provider.complete({
    messages,
    maxTokens: 1500,
    temperature: 0.8,
  });

  let parsed: Partial<StructuredNarrative>;
  try {
    parsed = parseJSON<Partial<StructuredNarrative>>(raw);
  } catch (error) {
    console.warn("[game-llm] Narrative JSON parse failed; using deterministic fallback:", error);
    parsed = {};
  }

  // Ensure otherActions are sorted by order
  const otherActions = Array.isArray(parsed.otherActions)
    ? parsed.otherActions
        .filter((a: { actor?: string }) => a && typeof a === "object" && a.actor)
        .sort((a: { order?: number }, b: { order?: number }) => (a.order ?? 99) - (b.order ?? 99))
    : actorResponses.map((r, i) => ({
        actor: r.actorName,
        description: r.action,
        order: i + 1,
      }));

  return {
    playerAction: parsed.playerAction || `You chose to ${playerChoice.text.toLowerCase()}.`,
    consequences: parsed.consequences || "",
    otherActions,
    worldUpdate: parsed.worldUpdate || "",
  };
}

/**
 * Generate choices via LLM.
 */
export async function getLLMChoices(
  state: ScenarioState,
  playerChoiceThisTurn?: { text: string },
  previousChoices?: Choice[],
  scenarioPackage?: ScenarioPackage,
  suggestedAction?: string
): Promise<Choice[]> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured");
  }

  const provider = getLLMProvider();
  const minChoices = scenarioPackage?.choicePolicy.minChoices ?? 3;

  const attemptChoiceGeneration = async () => {
    const messages = buildChoiceGenerationPrompt(
      state,
      playerChoiceThisTurn,
      previousChoices,
      scenarioPackage,
      suggestedAction
    );

    const raw = await provider.complete({
      messages,
      maxTokens: 1024,
      temperature: 0.7,
    });

    let parsedChoices: Choice[] | null = null;
    try {
      const parsed = parseJSON(raw);
      parsedChoices = validateChoices(parsed, scenarioPackage);
    } catch (error) {
      console.warn(
        "[game-llm] Choice JSON parse failed; attempting fallback generation:",
        error
      );
    }

    return validateGeneratedChoices(state, parsedChoices, {
      previousChoices,
      scenarioPackage,
      suggestedAction,
    });
  };

  let choices = await attemptChoiceGeneration();
  if (choices.length < minChoices) {
    choices = await attemptChoiceGeneration();
  }

  const suggestedChoice = suggestedAction
    ? buildSuggestedChoice(suggestedAction, state)
    : null;

  if (suggestedChoice) {
    const validatedSuggestion = validateGeneratedChoices(state, [suggestedChoice], {
      previousChoices: [...(previousChoices ?? []), ...choices],
      scenarioPackage,
      suggestedAction,
    });
    if (validatedSuggestion.length > 0) {
      choices = [validatedSuggestion[0], ...choices];
    }
  }

  if (choices.length === 0) {
    choices = scenarioPackage
      ? getStubScenarioChoices(state, scenarioPackage, previousChoices)
      : getStubChoices(state);
  }

  return choices
    .slice(0, scenarioPackage?.choicePolicy.maxChoices ?? 5)
    .map((choice) => ({
      ...choice,
      source: choice.source ?? "llm",
      ...(choice.debugReasoning && !choice.debugReasoningSource
        ? { debugReasoningSource: "llm" as const }
        : {}),
    }));
}

/**
 * Generate the initial page via LLM.
 */
export async function getLLMInitialPage(
  state: ScenarioState
): Promise<PageData> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured");
  }

  const provider = getLLMProvider();
  const messages = buildInitialPagePrompt(state);

  const raw = await provider.complete({
    messages,
    maxTokens: 2048,
    temperature: 0.8,
  });

  let parsed: {
    title?: string;
    narrative?: string;
    choices?: unknown;
  };
  let choices: Choice[] | null = null;
  try {
    parsed = parseJSON<{
      title?: string;
      narrative?: string;
      choices?: unknown;
    }>(raw);
    choices = validateChoices(parsed.choices ?? parsed);
  } catch (error) {
    console.warn("[game-llm] Initial page JSON parse failed; using deterministic fallback:", error);
    const fallback = getStubInitialPage(state);
    parsed = {
      title: fallback.title,
      narrative: fallback.narrative,
      choices: fallback.choices,
    };
    choices = fallback.choices;
  }
  const stateSummary = buildStateSummary(state);

  if (!choices || choices.length === 0) {
    choices = getStubChoices(state);
  }

  return {
    title: parsed.title || "The Stage Is Set",
    narrative: {
      playerAction: parsed.narrative || "Your story begins...",
      consequences: "",
      otherActions: [],
      worldUpdate: "",
    },
    stateSummary,
    choices,
  };
}
