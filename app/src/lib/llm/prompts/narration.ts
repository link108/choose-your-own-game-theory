import type {
  ScenarioState,
  ActorResponseData,
  StateChange,
} from "@/lib/types";
import type { Message } from "../types";

export function buildNarrationPrompt(
  state: ScenarioState,
  playerChoice: { text: string },
  actorResponses: ActorResponseData[],
  stateChanges: StateChange[]
): Message[] {
  const player = state.actors.find((a) => a.isPlayer);

  const system = `You are a narrative writer for an interactive strategy simulation. You produce structured JSON describing what happened this turn.

You must respond ONLY with valid JSON in this exact format:
{
  "playerAction": "1-2 paragraphs describing what the player did and the immediate result. Second person (You...).",
  "consequences": "1-2 paragraphs describing the consequences and ripple effects of the player's action.",
  "otherActions": [
    {
      "actor": "Actor Name",
      "description": "1-2 sentences describing what this actor did and why.",
      "order": 1
    }
  ],
  "worldUpdate": "1 paragraph summarizing how the broader situation has shifted. Reference specific world variable changes if relevant."
}

Style:
- Vivid but concise prose
- Second person for player sections ("You...")
- Third person for other actors
- Reference actual resource/variable changes when significant
- Build tension and stakes
- otherActions should be ordered by narrative importance (most impactful first)`;

  const actorActionsText = actorResponses
    .map((r) => `- ${r.actorName}: ${r.action} (reasoning: ${r.reasoning})`)
    .join("\n");

  const changesText = stateChanges
    .map((c) => {
      if (c.type === "resource") {
        const delta = typeof c.newValue === "number" && typeof c.oldValue === "number"
          ? c.newValue - c.oldValue : null;
        return `- [resource] ${c.target}'s ${c.field}: ${delta !== null ? (delta > 0 ? "+" : "") + delta : "→ " + c.newValue} (${c.reason})`;
      }
      return `- [${c.type}] ${c.target}: ${c.oldValue} → ${c.newValue} (${c.reason})`;
    })
    .join("\n");

  const worldContext = state.worldVariables
    .map((v) => `${v.name}: ${v.value}`)
    .join(", ");

  const userMessage = `Turn ${state.turn + 1}

Player (${player?.name}) chose: "${playerChoice.text}"

Actor responses:
${actorActionsText}

State changes:
${changesText || "None"}

World state: ${worldContext}

Write the structured narrative for this turn. JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
