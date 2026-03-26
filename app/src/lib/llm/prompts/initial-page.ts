import type { ScenarioState } from "@/lib/types";
import type { Message } from "../types";

export function buildInitialPagePrompt(state: ScenarioState): Message[] {
  const player = state.actors.find((a) => a.isPlayer);
  const npcs = state.actors.filter((a) => !a.isPlayer);

  const system = `You are a narrative writer for an interactive strategy simulation. Write an opening scene that sets up the scenario.

You must respond with ONLY valid JSON in this format:
{
  "title": "A dramatic opening title",
  "narrative": "2-4 paragraphs in second person (You...) that set the scene, introduce the player's situation, and build tension. Use markdown for emphasis.",
  "choices": [
    {
      "id": "unique_snake_case_id",
      "text": "Short action label",
      "description": "What this means"
    }
  ]
}

Guidelines:
- The narrative should make the player feel the stakes
- Introduce key actors naturally
- Reference actual resources and world variables
- 3-5 opening choices that set different strategic directions
- Write as if this is the opening page of an interactive novel`;

  const relationships = state.relationships
    .filter((r) => r.fromActorId === player?.id)
    .map((r) => {
      const target = state.actors.find((a) => a.id === r.toActorId);
      return `  → ${target?.name}: ${r.type} (strength: ${r.strength})`;
    })
    .join("\n");

  const userMessage = `Scenario setup:

Player: ${player?.name}
Description: ${player?.description}
Goals: ${(player?.goals as string[])?.join(", ")}
Resources: ${player?.resources.map((r) => `${r.name}: ${r.value}`).join(", ")}

Other actors:
${npcs.map((a) => `- ${a.name}: ${a.description}\n  Goals: ${(a.goals as string[]).join(", ")}\n  Traits: ${(a.traits as string[]).join(", ")}\n  Resources: ${a.resources.map((r) => `${r.name}: ${r.value}`).join(", ")}`).join("\n\n")}

Relationships:
${relationships || "  None defined"}

World: ${state.worldVariables.map((v) => `${v.name}: ${v.value}`).join(", ")}

Write the opening page. JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
