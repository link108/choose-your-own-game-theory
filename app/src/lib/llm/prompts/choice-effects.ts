import type { ScenarioState } from "@/lib/types";
import type { ScenarioPackage } from "@/lib/scenario-dsl";
import type { Message } from "../types";

export function buildChoiceScenarioEffectsPrompt(
  state: ScenarioState,
  playerChoice: { text: string },
  scenarioPackage: ScenarioPackage
): Message[] {
  const player = state.actors.find((a) => a.isPlayer);
  const preferredEffectIds = new Set(
    scenarioPackage.choicePolicy.preferredEffectIds ?? []
  );
  const effectList = scenarioPackage.effectDefinitions
    .map((effect) => {
      const params = Object.entries(effect.parameters ?? {})
        .map(([name, def]) =>
          def.type === "object" && def.objectType
            ? `${name}:${def.type}<${def.objectType}>${def.required === false ? "?" : ""}`
            : `${name}:${def.type}${def.required === false ? "?" : ""}`
        )
        .join(", ");
      const preferred = preferredEffectIds.has(effect.id) ? " [preferred]" : "";
      return `- "${effect.id}"${preferred}: ${effect.description}${params ? ` | bindings: ${params}` : ""}`;
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
    .map((actor) => {
      const resources = actor.resources
        .map((resource) => `    - resourceId: "${resource.id}" (${resource.name}: ${resource.value})`)
        .join("\n");
      return `- actorId: "${actor.id}" (${actor.name}${actor.isPlayer ? " [PLAYER]" : ""})${
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

  const system = `You are analyzing the direct consequences of a player's action in a strategy simulation.

You do not mutate state directly. Choose scenario-defined effects and bind them to valid IDs from the state.

You must respond ONLY with valid JSON in this exact format:
{
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

## Valid Scenario Effects
${effectList}

## Rules
- Use ONLY effectIds listed above
- Use ONLY IDs listed in the state reference below
- Choose 0-3 effects that directly result from the player's action
- Include every required binding for the chosen effect
- Do NOT invent entities, bindings, or raw numeric deltas
- Prefer effects marked [preferred] when they fit

${actorSection}${relationshipSection}${worldSection}${objectSection}`;

  const userMessage = `Turn ${state.turn + 1}

Player (${player?.name ?? "Player"}) chose: "${playerChoice.text}"

What direct simulation effects should resolve from this choice? Respond with JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
