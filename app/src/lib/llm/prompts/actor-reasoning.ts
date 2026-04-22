import type { ScenarioState, ActorState, GameEvent } from "@/lib/types";
import type { ScenarioPackage } from "@/lib/scenario-dsl";
import type { Message } from "../types";
import { toStringArray } from "../util";

export function buildActorReasoningScenarioEffectsPrompt(
  state: ScenarioState,
  actor: ActorState,
  playerChoice: { text: string },
  recentEvents: GameEvent[],
  scenarioPackage: ScenarioPackage
): Message[] {
  const player = state.actors.find((a) => a.isPlayer);
  const relationship = state.relationships.find(
    (r) => r.fromActorId === actor.id && r.toActorId === player?.id
  );

  const allowedEffectIds = new Set(
    scenarioPackage.actorCapabilities?.find((capability) => capability.actorId === actor.id)
      ?.effectIds ?? scenarioPackage.effectDefinitions.map((effect) => effect.id)
  );

  const effectList = scenarioPackage.effectDefinitions
    .filter((effect) => allowedEffectIds.has(effect.id))
    .map((effect) => {
      const params = Object.entries(effect.parameters ?? {})
        .map(([name, def]) =>
          def.type === "object" && def.objectType
            ? `${name}:${def.type}<${def.objectType}>${def.required === false ? "?" : ""}`
            : `${name}:${def.type}${def.required === false ? "?" : ""}`
        )
        .join(", ");
      return `- "${effect.id}": ${effect.description}${params ? ` | bindings: ${params}` : ""}`;
    })
    .join("\n");

  const objectSection =
    state.scenarioObjects && state.scenarioObjects.length > 0
      ? `\n## Scenario Objects\n${state.scenarioObjects
          .map(
            (object) =>
              `- objectId: "${object.id}" (${object.name}, type: ${object.typeId}, visibility: ${object.visibility})`
          )
          .join("\n")}`
      : "";

  const actorSection = `## Actors & Resources\n${state.actors
    .map((stateActor) => {
      const resources = stateActor.resources
        .map(
          (resource) =>
            `    - resourceId: "${resource.id}" (${resource.name}: ${resource.value})`
        )
        .join("\n");
      return `- actorId: "${stateActor.id}" (${stateActor.name})${
        resources ? `\n${resources}` : ""
      }`;
    })
    .join("\n")}`;

  const relationshipSection =
    state.relationships.length > 0
      ? `\n## Relationships\n${state.relationships
          .map((rel) => `- relationshipId: "${rel.id}" (${rel.type}, strength: ${rel.strength})`)
          .join("\n")}`
      : "";

  const worldSection =
    state.worldVariables.length > 0
      ? `\n## World Variables\n${state.worldVariables
          .map((v) => `- variableId: "${v.id}" (${v.name}: ${v.value}, kind: ${v.kind})`)
          .join("\n")}`
      : "";

  const recentEventsText =
    recentEvents.length > 0
      ? `\nRecent events:\n${recentEvents.map((e) => `- ${e.description}`).join("\n")}`
      : "";

  const system = `You are simulating the behavior of "${actor.name}" in a strategy simulation.

You do not mutate state directly. Choose scenario-defined effects available to this actor and bind them to valid IDs from the state.

You must respond ONLY with valid JSON in this exact format:
{
  "action": "A 1-2 sentence description of what this actor does",
  "reasoning": "A brief explanation of their motivation",
  "effects": [
    {
      "effectId": "effect_id",
      "intensity": "minor",
      "bindings": {
        "parameterName": "entity_id"
      }
    }
  ]
}

## Valid Effects For This Actor
${effectList}

## Rules
- Use ONLY the effectIds listed above
- Use ONLY IDs listed in the state reference below
- Choose 0-2 effects reflecting this actor's response
- Include every required binding for the chosen effect
- Keep behavior consistent with this actor's goals, traits, and relationship to the player
- Do NOT invent entities, bindings, or raw numeric deltas

${actorSection}${relationshipSection}${worldSection}${objectSection}`;

  const userMessage = `Current situation:
- Turn: ${state.turn}
- Player (${player?.name}) just chose: "${playerChoice.text}"

Actor: ${actor.name}
Description: ${actor.description}
Goals: ${toStringArray(actor.goals).join(", ")}
Traits: ${toStringArray(actor.traits).join(", ")}
Resources: ${actor.resources.map((r) => `${r.name}: ${r.value}`).join(", ")}
Relationship to player: ${relationship ? `${relationship.type} (strength: ${relationship.strength}/100)` : "none defined"}
${recentEventsText}

How does ${actor.name} respond? Respond with JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
