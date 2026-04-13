import type {
  ScenarioState,
  ActorResponseData,
  StateChange,
  Choice,
  PageData,
  StructuredNarrative,
  ResolverSummary,
} from "@/lib/types";
import type { SemanticEffect } from "../simulation/resolver";
import { getLLMProvider, isLLMConfigured } from "./provider";
import { parseJSON, validateActorResponse, validateActorEffectsResponse, validateSemanticEffects, validateChoices } from "./parse";
import { buildActorReasoningPrompt, buildActorReasoningEffectsPrompt } from "./prompts/actor-reasoning";
import { buildNarrationPrompt } from "./prompts/narration";
import { buildChoiceGenerationPrompt } from "./prompts/choices";
import { buildInitialPagePrompt } from "./prompts/initial-page";
import { buildWorldUpdatePrompt } from "./prompts/world-update";
import { buildChoiceEffectsPrompt } from "./prompts/choice-effects";
import { getNonPlayerActors, getPlayerActor, buildStateSummary } from "../simulation/state";

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

  const parsed = parseJSON<Partial<StructuredNarrative>>(raw);

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
  previousChoices?: Choice[]
): Promise<Choice[]> {
  if (!isLLMConfigured()) {
    throw new Error("LLM is not configured");
  }

  const provider = getLLMProvider();
  const messages = buildChoiceGenerationPrompt(state, playerChoiceThisTurn, previousChoices);

  const raw = await provider.complete({
    messages,
    maxTokens: 1024,
    temperature: 0.7,
  });

  const parsed = parseJSON(raw);
  const choices = validateChoices(parsed);

  if (!choices || choices.length === 0) {
    throw new Error("LLM returned no valid choices");
  }

  return choices;
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

  const parsed = parseJSON<{
    title?: string;
    narrative?: string;
    choices?: unknown;
  }>(raw);

  const choices = validateChoices(parsed.choices ?? parsed);
  const stateSummary = buildStateSummary(state);

  if (!choices || choices.length === 0) {
    throw new Error("LLM initial page returned no valid choices");
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
