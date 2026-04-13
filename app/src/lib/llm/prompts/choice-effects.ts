import type { ScenarioState } from "@/lib/types";
import type { Message } from "../types";

export function buildChoiceEffectsPrompt(
  state: ScenarioState,
  playerChoice: { text: string },
  validEffectTypes: string[]
): Message[] {
  const player = state.actors.find((a) => a.isPlayer);
  const effectTypeList = validEffectTypes.map((t) => `  - "${t}"`).join("\n");

  const system = `You are analyzing the direct consequences of a player's action in a strategy simulation.

You do not control numeric values. Express consequences as effect types and intensities only.

You must respond ONLY with valid JSON in this exact format:
{
  "effects": [
    { "type": "effect_type", "intensity": "minor" },
    { "type": "effect_type", "intensity": "moderate", "target": "Actor Name" }
  ]
}

Valid effect types for this scenario:
${effectTypeList}

Intensity levels:
- "minor": small or indirect consequence
- "moderate": meaningful consequence
- "major": significant or dramatic consequence

Rules:
- Only use effect types from the list above. Do NOT invent new types.
- Choose 0–3 effects that directly result from the player's action.
- Optionally include "target" if the effect is directed at a specific actor.
- Do NOT include numeric values, percentages, or raw deltas.`;

  const worldContext = state.worldVariables
    .map((v) => `${v.name}: ${v.value}`)
    .join(", ");

  const actorContext = state.actors
    .filter((a) => !a.isPlayer)
    .map((a) => a.name)
    .join(", ");

  const userMessage = `Turn ${state.turn + 1}

Player (${player?.name ?? "Player"}) chose: "${playerChoice.text}"

World state: ${worldContext || "None"}
Other actors present: ${actorContext || "None"}

What are the direct consequences of this choice? Use only the valid effect types listed above. Respond with JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
