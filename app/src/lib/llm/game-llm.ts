import type {
  ScenarioState,
  Choice,
  PageData,
  StructuredNarrative,
} from "@/lib/types";
import type {
  ScenarioEffectInvocation,
  ScenarioPackage,
} from "@/lib/scenario-dsl";
import { getLLMProvider, isLLMConfigured } from "./provider";
import {
  parseJSON,
  validateActorScenarioEffectsResponse,
  validateScenarioEffectInvocations,
  validateChoices,
} from "./parse";
import {
  buildActorReasoningScenarioEffectsPrompt,
} from "./prompts/actor-reasoning";
import { buildNarrationPrompt } from "./prompts/narration";
import { buildChoiceGenerationPrompt } from "./prompts/choices";
import { buildInitialPagePrompt } from "./prompts/initial-page";
import {
  buildChoiceScenarioEffectsPrompt,
} from "./prompts/choice-effects";
import { getNonPlayerActors, buildStateSummary } from "../simulation/state";
import {
  inspectGeneratedChoices,
  validateGeneratedChoices,
} from "../simulation/choices/validation";
import type { NarrationGrounding } from "../simulation/narrative-grounding";
import type { Message } from "./types";

export interface ChoiceGenerationAttemptTrace {
  attempt: number;
  prompt: Message[];
  rawResponse?: string;
  parsedChoices?: Choice[] | null;
  validChoices?: Choice[];
  rejectedChoices?: Array<{
    id: string;
    text: string;
    reasons: string[];
    executionError?: string;
  }>;
  error?: string;
}

export interface ChoiceGenerationTrace {
  minChoices: number;
  previousChoiceCount: number;
  excludedChoiceCount: number;
  suggestedAction?: string;
  attempts: ChoiceGenerationAttemptTrace[];
}

export interface GetLLMChoicesOptions {
  previousChoices?: Choice[];
  excludedChoices?: Choice[];
  scenarioPackage?: ScenarioPackage;
  suggestedAction?: string;
}

export class ChoiceGenerationError extends Error {
  readonly trace: ChoiceGenerationTrace;

  constructor(message: string, trace: ChoiceGenerationTrace) {
    super(message);
    this.name = "ChoiceGenerationError";
    this.trace = trace;
  }
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
 * Generate structured narrative via LLM.
 */
export async function getLLMNarrative(
  grounding: NarrationGrounding
): Promise<StructuredNarrative> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured");
  }

  const provider = getLLMProvider();
  const messages = buildNarrationPrompt(
    grounding.playerChoice,
    grounding.actorActions,
    grounding.visibleStateChanges,
    grounding.visibleEvents,
    grounding.stateSummary,
    grounding.resolverSummary
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
    throw new Error(
      `Narrative JSON parse failed: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }

  // Ensure otherActions are sorted by order
  const otherActions = Array.isArray(parsed.otherActions)
    ? parsed.otherActions
        .filter((a: { actor?: string }) => a && typeof a === "object" && a.actor)
        .sort((a: { order?: number }, b: { order?: number }) => (a.order ?? 99) - (b.order ?? 99))
    : [];

  if (!parsed.playerAction || !parsed.consequences) {
    throw new Error("Narrative response is missing required structured fields.");
  }

  return {
    playerAction: parsed.playerAction,
    consequences: parsed.consequences,
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
  options: GetLLMChoicesOptions = {}
): Promise<Choice[]> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured");
  }

  const {
    previousChoices,
    excludedChoices,
    scenarioPackage,
    suggestedAction,
  } = options;
  const provider = getLLMProvider();
  const minChoices = scenarioPackage?.choicePolicy.minChoices ?? 3;
  const trace: ChoiceGenerationTrace = {
    minChoices,
    previousChoiceCount: previousChoices?.length ?? 0,
    excludedChoiceCount: excludedChoices?.length ?? 0,
    ...(suggestedAction?.trim() ? { suggestedAction: suggestedAction.trim() } : {}),
    attempts: [],
  };

  const attemptChoiceGeneration = async (
    attempt: number,
    rejectedChoices?: ChoiceGenerationAttemptTrace["rejectedChoices"]
  ) => {
    const messages = buildChoiceGenerationPrompt(
      state,
      playerChoiceThisTurn,
      {
        previousChoices,
        excludedChoices,
        scenarioPackage,
        suggestedAction,
        rejectedChoices,
      }
    );
    const attemptTrace: ChoiceGenerationAttemptTrace = {
      attempt,
      prompt: messages,
    };
    trace.attempts.push(attemptTrace);

    let raw: string;
    try {
      raw = await provider.complete({
        messages,
        maxTokens: 1024,
        temperature: 0.7,
      });
    } catch (error) {
      attemptTrace.error =
        error instanceof Error ? error.message : "LLM provider request failed";
      throw error;
    }
    attemptTrace.rawResponse = raw;

    let parsedChoices: Choice[] | null = null;
    try {
      const parsed = parseJSON(raw);
      parsedChoices = validateChoices(parsed, scenarioPackage);
    } catch (error) {
      attemptTrace.error = `Choice JSON parse failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`;
      throw new Error(attemptTrace.error);
    }
    attemptTrace.parsedChoices = parsedChoices;

    const inspection = inspectGeneratedChoices(state, parsedChoices, {
      previousChoices,
      excludedChoices,
      scenarioPackage,
      suggestedAction,
    });
    attemptTrace.validChoices = inspection
      .filter((item) => item.valid)
      .map((item) => item.choice);
    attemptTrace.rejectedChoices = inspection
      .filter((item) => !item.valid)
      .map((item) => ({
        id: item.choice.id,
        text: item.choice.text,
        reasons: [...item.reasons],
        ...(item.executionError
          ? { executionError: item.executionError }
          : {}),
      }));

    return validateGeneratedChoices(state, parsedChoices, {
      previousChoices,
      excludedChoices,
      scenarioPackage,
      suggestedAction,
    });
  };

  let choices = await attemptChoiceGeneration(1);
  if (choices.length < minChoices) {
    choices = await attemptChoiceGeneration(
      2,
      trace.attempts[0]?.rejectedChoices
    );
  }

  if (choices.length < minChoices) {
    throw new ChoiceGenerationError(
      `Choice generation produced ${choices.length} valid choices; expected at least ${minChoices}.`,
      trace
    );
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
    throw new Error(
      `Initial page JSON parse failed: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
  const stateSummary = buildStateSummary(state);

  if (!choices || choices.length === 0) {
    throw new Error("Initial page response did not include any valid choices.");
  }

  if (!parsed.title || !parsed.narrative) {
    throw new Error("Initial page response is missing required title or narrative fields.");
  }

  return {
    title: parsed.title,
    narrative: {
      playerAction: parsed.narrative,
      consequences: "",
      otherActions: [],
      worldUpdate: "",
    },
    stateSummary,
    choices,
  };
}
