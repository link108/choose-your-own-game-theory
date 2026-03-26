import type {
  ScenarioState,
  ActorResponseData,
  StateChange,
  GameEvent,
} from "@/lib/types";
import type { Message } from "../types";

export function buildNarrationPrompt(
  state: ScenarioState,
  playerChoice: { text: string },
  actorResponses: ActorResponseData[],
  stateChanges: StateChange[],
  _events: GameEvent[]
): Message[] {
  const player = state.actors.find((a) => a.isPlayer);

  const system = `You are a narrative writer for an interactive strategy simulation. Write engaging, concise prose that describes what happened this turn.

Style guidelines:
- Write in second person ("You...")
- 2-4 paragraphs, vivid but concise
- Focus on consequences and drama
- Reference actual resource changes when significant
- End with a sense of tension or anticipation
- Do NOT include choices or options — just narrate what happened`;

  const actorResponsesText = actorResponses
    .map((r) => `- ${r.actorName}: ${r.action} (${r.reasoning})`)
    .join("\n");

  const changesText = stateChanges
    .filter((c) => c.type === "resource")
    .map((c) => {
      const delta =
        typeof c.newValue === "number" && typeof c.oldValue === "number"
          ? c.newValue - c.oldValue
          : null;
      return `- ${c.target}'s ${c.field}: ${delta !== null ? (delta > 0 ? "+" : "") + delta : `→ ${c.newValue}`} (${c.reason})`;
    })
    .join("\n");

  const worldContext = state.worldVariables
    .map((v) => `${v.name}: ${v.value}`)
    .join(", ");

  const userMessage = `Turn ${state.turn + 1}

Player (${player?.name}) chose: "${playerChoice.text}"

Actor responses:
${actorResponsesText}

Resource changes:
${changesText || "None"}

World state: ${worldContext}

Write a narrative describing this turn's events.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
