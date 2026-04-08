import type { ScenarioState, ActorResponseData, StateChange } from "@/lib/types";
import type { Message } from "../types";

export function buildWorldUpdatePrompt(
  state: ScenarioState,
  playerChoice: { text: string },
  actorResponses: ActorResponseData[],
  appliedResourceChanges: StateChange[]
): Message[] {
  const player = state.actors.find((a) => a.isPlayer);

  const system = `You are the world simulation engine for a strategy game. After all actors have taken their actions, you determine how the world state changes.

You must respond ONLY with valid JSON in this exact format:
{
  "worldVariableChanges": [
    {
      "name": "Variable Name",
      "newValue": "new value as string",
      "reason": "Brief explanation"
    }
  ],
  "relationshipChanges": [
    {
      "fromActor": "Actor Name",
      "toActor": "Actor Name",
      "newStrength": 55,
      "reason": "Brief explanation"
    }
  ]
}

Rules:
- Only reference world variables that exist in the current state
- Only reference actors that exist
- World variable values must respect their min/max ranges
- Relationship strength must be 0-100
- Consider cause and effect: military actions increase tension, trade improves relationships, threats increase threat levels
- Not every variable needs to change every turn — only update what logically should change
- Be proportional: small actions = small changes, dramatic actions = larger changes`;

  const actorActionsText = actorResponses
    .map((r) => `- ${r.actorName}: ${r.action}`)
    .join("\n");

  const resourceChangesText = appliedResourceChanges
    .filter((c) => c.type === "resource")
    .map((c) => {
      const delta = typeof c.newValue === "number" && typeof c.oldValue === "number"
        ? c.newValue - c.oldValue : null;
      return `- ${c.target}'s ${c.field}: ${delta !== null ? (delta > 0 ? "+" : "") + delta : "→ " + c.newValue} (${c.reason})`;
    })
    .join("\n");

  const worldVarsText = state.worldVariables
    .map((v) => `- ${v.name}: ${v.value} (type: ${v.type}${v.minValue !== null ? `, min: ${v.minValue}` : ""}${v.maxValue !== null ? `, max: ${v.maxValue}` : ""})`)
    .join("\n");

  const relationshipsText = state.relationships
    .map((r) => {
      const from = state.actors.find((a) => a.id === r.fromActorId)?.name ?? "?";
      const to = state.actors.find((a) => a.id === r.toActorId)?.name ?? "?";
      return `- ${from} → ${to}: ${r.type} (strength: ${r.strength})`;
    })
    .join("\n");

  const userMessage = `Turn ${state.turn + 1} just resolved. Here's what happened:

Player (${player?.name}) chose: "${playerChoice.text}"

Actor actions:
${actorActionsText || "  None"}

Resource changes applied:
${resourceChangesText || "  None"}

Current world variables:
${worldVarsText}

Current relationships:
${relationshipsText}

Based on what happened this turn, what world variables and relationships should change? JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
