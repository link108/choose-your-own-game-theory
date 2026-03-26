import type {
  ScenarioState,
  ActorResponseData,
  StateChange,
  Choice,
  PageData,
} from "@/lib/types";
import { getLLMProvider, isLLMConfigured } from "./provider";
import { parseJSON, validateActorResponse, validateChoices } from "./parse";
import { buildActorReasoningPrompt } from "./prompts/actor-reasoning";
import { buildNarrationPrompt } from "./prompts/narration";
import { buildChoiceGenerationPrompt } from "./prompts/choices";
import { buildInitialPagePrompt } from "./prompts/initial-page";
import { getNonPlayerActors, getPlayerActor, buildStateSummary } from "../simulation/state";
import {
  getStubActorResponses,
  getStubChoices,
  getStubInitialPage,
} from "../simulation/stub-actors";

/**
 * Get actor responses via LLM. Falls back to stubs on failure.
 */
export async function getLLMActorResponses(
  state: ScenarioState,
  playerChoice: { id: string; text: string }
): Promise<ActorResponseData[]> {
  if (!isLLMConfigured()) {
    return getStubActorResponses(state, playerChoice);
  }

  const provider = getLLMProvider();
  const npcs = getNonPlayerActors(state);
  const player = getPlayerActor(state);
  if (!player) return [];

  const recentEvents = state.eventHistory.slice(-5);

  // Run actor reasoning in parallel
  const responses = await Promise.allSettled(
    npcs.map(async (npc) => {
      const messages = buildActorReasoningPrompt(
        state,
        npc,
        playerChoice,
        recentEvents
      );

      try {
        const raw = await provider.complete({
          messages,
          maxTokens: 500,
          temperature: 0.7,
        });

        const parsed = parseJSON(raw);
        const validated = validateActorResponse(parsed);

        if (!validated) {
          console.warn(`Invalid LLM response for ${npc.name}, using stub`);
          return getStubActorResponses(state, playerChoice).find(
            (r) => r.actorId === npc.id
          )!;
        }

        // Convert delta-based changes to absolute values
        const proposedChanges: StateChange[] = validated.stateChanges.map(
          (c) => {
            if (c.type === "resource" && c.delta !== undefined) {
              const targetActor = state.actors.find(
                (a) => a.name === c.target
              );
              const resource = targetActor?.resources.find(
                (r) => r.name === c.field
              );
              const oldValue = resource?.value ?? 0;
              return {
                type: c.type as StateChange["type"],
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
      } catch (error) {
        console.warn(`LLM call failed for ${npc.name}:`, error);
        return getStubActorResponses(state, playerChoice).find(
          (r) => r.actorId === npc.id
        )!;
      }
    })
  );

  return responses
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((r): r is ActorResponseData => r !== null);
}

/**
 * Generate narrative via LLM. Falls back to basic narrative on failure.
 */
export async function getLLMNarrative(
  state: ScenarioState,
  playerChoice: { text: string },
  actorResponses: ActorResponseData[],
  stateChanges: StateChange[],
  events: { id: string; turn: number; type: string; description: string; involvedActors: string[] }[]
): Promise<string> {
  if (!isLLMConfigured()) {
    return buildBasicNarrative(playerChoice, actorResponses, stateChanges);
  }

  try {
    const provider = getLLMProvider();
    const messages = buildNarrationPrompt(
      state,
      playerChoice,
      actorResponses,
      stateChanges,
      events
    );

    const narrative = await provider.complete({
      messages,
      maxTokens: 800,
      temperature: 0.8,
    });

    return narrative;
  } catch (error) {
    console.warn("LLM narration failed:", error);
    return buildBasicNarrative(playerChoice, actorResponses, stateChanges);
  }
}

/**
 * Generate choices via LLM. Falls back to stubs on failure.
 */
export async function getLLMChoices(
  state: ScenarioState
): Promise<Choice[]> {
  if (!isLLMConfigured()) {
    return getStubChoices(state);
  }

  try {
    const provider = getLLMProvider();
    const messages = buildChoiceGenerationPrompt(state);

    const raw = await provider.complete({
      messages,
      maxTokens: 500,
      temperature: 0.7,
    });

    const parsed = parseJSON(raw);
    const choices = validateChoices(parsed);

    if (!choices || choices.length === 0) {
      console.warn("Invalid LLM choices, using stubs");
      return getStubChoices(state);
    }

    return choices;
  } catch (error) {
    console.warn("LLM choice generation failed:", error);
    return getStubChoices(state);
  }
}

/**
 * Generate the initial page via LLM.
 */
export async function getLLMInitialPage(
  state: ScenarioState
): Promise<PageData> {
  if (!isLLMConfigured()) {
    const stub = getStubInitialPage(state);
    return {
      ...stub,
      stateSummary: buildStateSummary(state),
    };
  }

  try {
    const provider = getLLMProvider();
    const messages = buildInitialPagePrompt(state);

    const raw = await provider.complete({
      messages,
      maxTokens: 1000,
      temperature: 0.8,
    });

    const parsed = parseJSON<{
      title?: string;
      narrative?: string;
      choices?: unknown;
    }>(raw);

    const choices = validateChoices(parsed.choices ?? parsed);
    const stateSummary = buildStateSummary(state);

    return {
      title: parsed.title || "The Stage Is Set",
      narrative: parsed.narrative || "Your story begins...",
      stateSummary,
      choices: choices || getStubChoices(state),
    };
  } catch (error) {
    console.warn("LLM initial page failed:", error);
    const stub = getStubInitialPage(state);
    return {
      ...stub,
      stateSummary: buildStateSummary(state),
    };
  }
}

// --- Fallback helpers ---

function buildBasicNarrative(
  playerChoice: { text: string },
  actorResponses: ActorResponseData[],
  stateChanges: StateChange[]
): string {
  const parts: string[] = [];
  parts.push(`You chose to **${playerChoice.text.toLowerCase()}**.`);
  parts.push("");

  for (const r of actorResponses) {
    parts.push(r.action);
  }

  const resourceChanges = stateChanges.filter((c) => c.type === "resource");
  if (resourceChanges.length > 0) {
    parts.push("");
    for (const c of resourceChanges) {
      const delta =
        typeof c.newValue === "number" && typeof c.oldValue === "number"
          ? c.newValue - c.oldValue
          : null;
      if (delta !== null) {
        const sign = delta > 0 ? "+" : "";
        parts.push(`*${c.target}'s ${c.field}: ${sign}${delta}*`);
      }
    }
  }

  return parts.join("\n");
}
