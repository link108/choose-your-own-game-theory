import type { ScenarioState, ActorState, GameEvent } from "@/lib/types";
import type { Message } from "../types";

export function buildActorReasoningPrompt(
  state: ScenarioState,
  actor: ActorState,
  playerChoice: { text: string },
  recentEvents: GameEvent[]
): Message[] {
  const player = state.actors.find((a) => a.isPlayer);
  const relationship = state.relationships.find(
    (r) => r.fromActorId === actor.id && r.toActorId === player?.id
  );

  const system = `You are simulating the behavior of "${actor.name}" in a strategy simulation.

You must respond ONLY with valid JSON in this exact format:
{
  "action": "A 1-2 sentence description of what this actor does in response",
  "reasoning": "A brief explanation of their motivation",
  "stateChanges": [
    {
      "type": "resource",
      "target": "Actor Name",
      "field": "Resource Name",
      "delta": -10,
      "reason": "Brief reason"
    }
  ]
}

Rules:
- stateChanges must only reference actors and resources that exist in the state
- Resource deltas should be small and proportional (typically -20 to +20 per turn)
- The actor should behave consistently with their traits and goals
- Consider the relationship with the player when deciding actions
- Do not invent new actors or resources`;

  const recentEventsText =
    recentEvents.length > 0
      ? `\nRecent events:\n${recentEvents.map((e) => `- ${e.description}`).join("\n")}`
      : "";

  const userMessage = `Current situation:
- Turn: ${state.turn}
- Player (${player?.name}) just chose: "${playerChoice.text}"

Actor: ${actor.name}
Description: ${actor.description}
Goals: ${(actor.goals as string[]).join(", ")}
Traits: ${(actor.traits as string[]).join(", ")}
Resources: ${actor.resources.map((r) => `${r.name}: ${r.value}`).join(", ")}
Relationship to player: ${relationship ? `${relationship.type} (strength: ${relationship.strength}/100)` : "none defined"}
${recentEventsText}

All actors in this scenario: ${state.actors.map((a) => a.name).join(", ")}
All resource types: ${[...new Set(state.actors.flatMap((a) => a.resources.map((r) => r.name)))].join(", ")}

How does ${actor.name} respond? Respond with JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
