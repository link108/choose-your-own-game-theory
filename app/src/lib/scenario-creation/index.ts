import { getLLMProvider, isLLMConfigured } from "@/lib/llm/provider";
import { parseJSON } from "@/lib/llm/parse";
import { buildScenarioCreationConversationPrompt } from "@/lib/llm/prompts/scenario-creation";
import {
  scenarioCreationAssistantResponseSchema,
  scenarioCreationWorkingDraftSchema,
  type ScenarioCreationAssistantResponse,
  type ScenarioCreationOptionGroupInput,
  type ScenarioCreationWorkingDraft,
} from "./schema";

export interface ScenarioCreationConversationTurn {
  assistantMessage: string;
  optionGroup?: ScenarioCreationOptionGroupInput;
  workingDraft: ScenarioCreationWorkingDraft;
}

interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function generateScenarioCreationConversationTurn(args: {
  workingDraft: ScenarioCreationWorkingDraft | null;
  messages: ConversationMessage[];
}): Promise<ScenarioCreationConversationTurn> {
  const safeDraft = scenarioCreationWorkingDraftSchema.safeParse(args.workingDraft);
  const currentDraft = safeDraft.success ? safeDraft.data : null;

  const response = isLLMConfigured()
    ? await generateWithLLM({
        workingDraft: currentDraft,
        messages: args.messages,
      }).catch((error) => {
        console.warn("[scenario-creation] LLM generation failed; using fallback:", error);
        return buildFallbackConversationTurn(currentDraft, args.messages);
      })
    : buildFallbackConversationTurn(currentDraft, args.messages);

  const nextDraft = mergeWorkingDraft(currentDraft, response.workingDraftPatch);

  return {
    assistantMessage: response.message,
    ...(response.optionGroup ? { optionGroup: response.optionGroup } : {}),
    workingDraft: nextDraft,
  };
}

async function generateWithLLM(args: {
  workingDraft: ScenarioCreationWorkingDraft | null;
  messages: ConversationMessage[];
}): Promise<ScenarioCreationAssistantResponse> {
  const provider = getLLMProvider();
  const prompt = buildScenarioCreationConversationPrompt(args);
  const raw = await provider.complete({
    messages: prompt,
    maxTokens: 1200,
    temperature: 0.4,
  });

  const parsed = parseJSON<unknown>(raw);
  return scenarioCreationAssistantResponseSchema.parse(parsed);
}

function mergeWorkingDraft(
  currentDraft: ScenarioCreationWorkingDraft | null,
  patch: ScenarioCreationAssistantResponse["workingDraftPatch"]
): ScenarioCreationWorkingDraft {
  const merged = {
    ...(currentDraft ?? {
      actorIdeas: [],
      worldVariableIdeas: [],
      notes: [],
      builderDraft: null,
    }),
    ...(patch ?? {}),
  };

  return scenarioCreationWorkingDraftSchema.parse({
    ...merged,
    actorIdeas: patch?.actorIdeas ?? merged.actorIdeas ?? [],
    worldVariableIdeas: patch?.worldVariableIdeas ?? merged.worldVariableIdeas ?? [],
    notes: patch?.notes ?? merged.notes ?? [],
    builderDraft: merged.builderDraft ?? null,
  });
}

function buildFallbackConversationTurn(
  currentDraft: ScenarioCreationWorkingDraft | null,
  messages: ConversationMessage[]
): ScenarioCreationAssistantResponse {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user")
    ?.content.trim();

  if (!currentDraft?.premise && lastUserMessage) {
    return {
      message:
        "I can help shape that into a playable scenario. First, choose the overall framing you want so I can draft the right tone and pressure model.",
      optionGroup: {
        stage: "frame_mode",
        kind: "scenario_mode",
        title: "Choose A Scenario Mode",
        description: "Pick the style of simulation you want to optimize for first.",
        selectionMode: "single",
        options: [
          {
            id: "realistic_diplomacy",
            label: "Realistic diplomacy",
            description: "Grounded negotiation, incentives, and political tradeoffs.",
            payload: { mode: "realistic diplomacy", realismLevel: "high" },
          },
          {
            id: "high_stakes_escalation",
            label: "High-stakes escalation",
            description: "A tense scenario with sharper brinkmanship and crisis pressure.",
            payload: { mode: "high-stakes escalation", realismLevel: "medium" },
          },
          {
            id: "educational_explainer",
            label: "Educational explainer",
            description: "Designed to teach the structure of the conflict clearly.",
            payload: { mode: "educational explainer", realismLevel: "high" },
          },
        ],
      },
      workingDraftPatch: {
        premise: lastUserMessage,
        title: suggestTitle(lastUserMessage),
        notes: ["Initial premise captured from the first user message."],
      },
    };
  }

  if (!currentDraft?.playerRole) {
    return {
      message:
        "A good next step is to define who the player actually controls. That choice will shape the available actions, resources, and first-turn tension.",
      optionGroup: {
        stage: "define_player_role",
        kind: "player_role",
        title: "Choose A Player Role",
        description: "Pick the point of view for the scenario.",
        selectionMode: "single",
        options: [
          {
            id: "state_leadership",
            label: "State leadership",
            description: "The player directly leads one of the main political actors.",
            payload: { playerRole: "state leadership" },
          },
          {
            id: "diplomatic_envoy",
            label: "Diplomatic envoy",
            description: "The player works through negotiation and coalition-building.",
            payload: { playerRole: "diplomatic envoy" },
          },
          {
            id: "crisis_coordinator",
            label: "Crisis coordinator",
            description: "The player manages escalation, logistics, and cross-actor response.",
            payload: { playerRole: "crisis coordinator" },
          },
        ],
      },
      workingDraftPatch: {
        notes: [
          ...(currentDraft?.notes ?? []),
          "Player role still needs to be defined.",
        ],
      },
    };
  }

  return {
    message:
      "I have enough context to keep building this out. Next, I’d suggest locking the actor set and the opening conflict so the draft can become more concrete.",
    optionGroup: {
      stage: "define_actors",
      kind: "actor_set",
      title: "Candidate Actor Set",
      description: "A first-pass actor set to react to or refine.",
      selectionMode: "multiple",
      options: [
        {
          id: "primary_state_actor",
          label: "Primary state actor",
          description: "The main government or command actor driving policy decisions.",
          payload: {
            actor: { id: "actor_primary_state", name: "Primary State Actor" },
          },
        },
        {
          id: "regional_rival",
          label: "Regional rival",
          description: "A direct competitor pushing against the player’s objectives.",
          payload: {
            actor: { id: "actor_regional_rival", name: "Regional Rival" },
          },
        },
        {
          id: "market_pressure_actor",
          label: "Market pressure actor",
          description: "A commercial or economic actor that changes incentives.",
          payload: {
            actor: { id: "actor_market_pressure", name: "Market Pressure Actor" },
          },
        },
      ],
    },
    workingDraftPatch: currentDraft ?? undefined,
  };
}

function suggestTitle(premise: string): string {
  const trimmed = premise.trim();
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 57).trimEnd()}...`;
}
