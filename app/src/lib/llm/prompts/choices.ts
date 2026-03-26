import type { ScenarioState } from "@/lib/types";
import type { Message } from "../types";

export function buildChoiceGenerationPrompt(
  state: ScenarioState
): Message[] {
  const player = state.actors.find((a) => a.isPlayer);
  const npcs = state.actors.filter((a) => !a.isPlayer);

  const system = `You generate choices for an interactive strategy simulation. Output ONLY valid JSON.

Format:
{
  "choices": [
    {
      "id": "unique_snake_case_id",
      "text": "Short action label (5-10 words)",
      "description": "What this means and likely consequences (1-2 sentences)"
    }
  ]
}

Rules:
- Generate 3-5 choices
- Each choice must be distinct and meaningful
- Choices should vary in risk/reward
- At least one diplomatic and one assertive option
- Choices must be grounded in the current state (don't offer impossible actions)
- Reference actual actors and resources by name
- Do NOT repeat previous choices verbatim`;

  const relationships = state.relationships
    .filter((r) => r.fromActorId === player?.id)
    .map((r) => {
      const target = state.actors.find((a) => a.id === r.toActorId);
      return `  ${target?.name}: ${r.type} (strength: ${r.strength})`;
    })
    .join("\n");

  const recentEvents = state.eventHistory
    .slice(-5)
    .map((e) => `- ${e.description}`)
    .join("\n");

  const userMessage = `Current state (Turn ${state.turn}):

Player: ${player?.name}
Resources: ${player?.resources.map((r) => `${r.name}: ${r.value}`).join(", ")}

Other actors:
${npcs.map((a) => `- ${a.name}: ${a.description.slice(0, 100)}... Resources: ${a.resources.map((r) => `${r.name}: ${r.value}`).join(", ")}`).join("\n")}

Relationships:
${relationships || "  None defined"}

World variables: ${state.worldVariables.map((v) => `${v.name}: ${v.value}`).join(", ")}

Recent events:
${recentEvents || "  None yet"}

Generate choices for the player. JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
