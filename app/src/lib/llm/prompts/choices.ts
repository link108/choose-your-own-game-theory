import type { ScenarioState, Choice } from "@/lib/types";
import type { Message } from "../types";

export function buildChoiceGenerationPrompt(
  state: ScenarioState,
  playerChoiceThisTurn?: { text: string },
  previousChoices?: Choice[]
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
- Choices must be VALID given the current state — check the event history
- Do NOT offer actions that are already done (e.g. if a pact was already signed, don't offer to sign it again)
- Recurring actions are fine (e.g. "negotiate with X" can appear again if it makes sense)
- Reference actual actors and resources by name`;

  const relationships = state.relationships
    .filter((r) => r.fromActorId === player?.id)
    .map((r) => {
      const target = state.actors.find((a) => a.id === r.toActorId);
      return `  ${target?.name}: ${r.type} (strength: ${r.strength})`;
    })
    .join("\n");

  const recentEvents = state.eventHistory
    .slice(-8)
    .map((e) => `- Turn ${e.turn}: ${e.description}`)
    .join("\n");

  const previousChoicesText = previousChoices?.length
    ? `\nChoices the player has already taken (DO NOT repeat these):\n${previousChoices.map((c) => `- "${c.text}"`).join("\n")}`
    : "";

  const justDidText = playerChoiceThisTurn
    ? `\nThe player JUST chose: "${playerChoiceThisTurn.text}" — generate choices that follow from this action, not repeat it.`
    : "";

  const userMessage = `Current state (Turn ${state.turn}):

Player: ${player?.name}
Resources: ${player?.resources.map((r) => `${r.name}: ${r.value}`).join(", ")}

Other actors:
${npcs.map((a) => `- ${a.name}: Resources: ${a.resources.map((r) => `${r.name}: ${r.value}`).join(", ")}`).join("\n")}

Relationships:
${relationships || "  None defined"}

World variables: ${state.worldVariables.map((v) => `${v.name}: ${v.value}`).join(", ")}

Event history:
${recentEvents || "  None yet"}
${previousChoicesText}
${justDidText}

Generate NEW choices for the player based on the current situation. JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
