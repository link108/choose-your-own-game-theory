import type { ScenarioState, ActorState, GameEvent } from "@/lib/types";
import type { ScenarioPackage } from "@/lib/scenario-dsl";
import type { Message } from "../types";
import { toStringArray } from "../util";
import type { ScenarioPromptConfig, ActorResponseConfig, EntityLookupMap } from "../../simulation/proposals";
import { buildEntityLookupMap } from "../../simulation/proposals";

/**
 * Options for building actor reasoning prompts with proposals.
 */
export interface ActorProposalPromptOptions {
  state: ScenarioState;
  actor: ActorState;
  playerChoice: { text: string };
  recentEvents: GameEvent[];
  promptConfig?: ScenarioPromptConfig | null;
  actorConfig?: ActorResponseConfig | null;
}

/**
 * Build an entity reference section for the prompt.
 * Lists all valid IDs the LLM can use in proposals.
 */
function buildEntityReferenceSection(
  state: ScenarioState,
  entityMap: EntityLookupMap
): string {
  const lines: string[] = [];

  // Actors and their resources
  lines.push("## Available Actors & Resources");
  for (const actor of state.actors) {
    const resourcesList = actor.resources
      .map((r) => `    - resourceId: "${r.id}" (${r.name}: ${r.value})`)
      .join("\n");
    lines.push(`- actorId: "${actor.id}" (${actor.name})`);
    if (resourcesList) lines.push(resourcesList);
  }

  // World variables (partitioned by type)
  const numericVars = state.worldVariables.filter(
    (v) => v.kind === "resource" || v.kind === "countdown" || v.kind === "counter"
  );
  const flagVars = state.worldVariables.filter((v) => v.kind === "flag");
  const textVars = state.worldVariables.filter((v) => v.kind === "text");

  if (numericVars.length > 0) {
    lines.push("\n## Numeric World Variables (for world_numeric_delta)");
    for (const v of numericVars) {
      lines.push(`- variableId: "${v.id}" (${v.name}: ${v.value})`);
    }
  }

  if (flagVars.length > 0 || textVars.length > 0) {
    lines.push("\n## Flag/Text World Variables (for world_fact_set)");
    for (const v of [...flagVars, ...textVars]) {
      lines.push(`- variableId: "${v.id}" (${v.name}: ${v.value}, kind: ${v.kind})`);
    }
  }

  // Relationships
  if (state.relationships.length > 0) {
    lines.push("\n## Relationships");
    for (const rel of state.relationships) {
      const desc = entityMap.relationshipIdToDescription.get(rel.id) ?? rel.id;
      lines.push(`- relationshipId: "${rel.id}" (${desc}, strength: ${rel.strength})`);
    }
  }

  return lines.join("\n");
}

/**
 * Proposal-based actor reasoning prompt.
 * Returns { action, reasoning, proposals: ProposedStateChange[] }.
 */
export function buildActorReasoningProposalPrompt(
  options: ActorProposalPromptOptions
): Message[] {
  const { state, actor, playerChoice, recentEvents, promptConfig, actorConfig } = options;

  const player = state.actors.find((a) => a.isPlayer);
  const relationship = state.relationships.find(
    (r) => r.fromActorId === actor.id && r.toActorId === player?.id
  );

  const entityMap = buildEntityLookupMap(state);
  const entitySection = buildEntityReferenceSection(state, entityMap);

  // Build effect type descriptions if available
  const effectDescriptions = promptConfig?.effectTypeDescriptions
    ? Object.entries(promptConfig.effectTypeDescriptions)
        .map(([type, desc]) => `  - "${type}": ${desc}`)
        .join("\n")
    : "";

  // Actor-specific hints
  const actorHints = actorConfig?.responseHints
    ? `\nPersonality guidance: ${actorConfig.responseHints}`
    : "";

  const resourcePriorities = actorConfig?.resourcePriorities?.length
    ? `\nThis actor prioritizes: ${actorConfig.resourcePriorities.join(", ")}`
    : "";

  // Scenario context
  const scenarioContext = promptConfig?.scenarioContext
    ? `\nScenario context: ${promptConfig.scenarioContext}`
    : "";

  const system = `You are simulating the behavior of "${actor.name}" in a strategy simulation.

You do not control numeric values directly. Instead, propose structured changes using IDs.

You must respond ONLY with valid JSON in this exact format:
{
  "action": "A 1-2 sentence description of what this actor does",
  "reasoning": "A brief explanation of their motivation",
  "proposals": [
    { "kind": "actor_resource_delta", "actorId": "actor_id", "resourceId": "resource_id", "intensity": "minor" },
    { "kind": "world_numeric_delta", "variableId": "var_id", "intensity": "moderate" },
    { "kind": "world_fact_set", "variableId": "var_id", "value": true, "reason": "Why this changed" },
    { "kind": "relationship_strength_delta", "relationshipId": "rel_id", "intensity": "major" },
    { "kind": "relationship_type_set", "relationshipId": "rel_id", "newType": "ally", "reason": "Why relationship changed" }
  ]
}

## Proposal Kinds

1. **actor_resource_delta**: Change an actor's resource by intensity
   - Required: kind, actorId, resourceId, intensity

2. **world_numeric_delta**: Change a numeric world variable by intensity
   - Required: kind, variableId, intensity

3. **world_fact_set**: Set a flag or text world variable to a specific value
   - Required: kind, variableId, value (boolean or string), reason

4. **relationship_strength_delta**: Change relationship strength by intensity
   - Required: kind, relationshipId, intensity

5. **relationship_type_set**: Change relationship type
   - Required: kind, relationshipId, newType, reason

## Intensity Levels
- "minor": small or indirect consequence
- "moderate": meaningful consequence
- "major": significant or dramatic consequence
${effectDescriptions ? `\n## Effect Types\n${effectDescriptions}` : ""}
${scenarioContext}
${actorHints}
${resourcePriorities}

## Rules
- Use ONLY the IDs listed in the entity reference below
- Choose 0-2 proposals reflecting this actor's response
- The actor should behave consistently with their traits and goals
- Consider the relationship with the player when deciding actions
- Do NOT include numeric values, percentages, or raw deltas

${entitySection}`;

  const recentEventsText =
    recentEvents.length > 0
      ? `\nRecent events:\n${recentEvents.map((e) => `- ${e.description}`).join("\n")}`
      : "";

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

How does ${actor.name} respond? Use entity IDs from the reference. Respond with JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}

/**
 * Resolver-aware actor reasoning prompt (legacy SemanticEffect format).
 * Returns { action, reasoning, effects: SemanticEffect[] } instead of stateChanges.
 */
export function buildActorReasoningEffectsPrompt(
  state: ScenarioState,
  actor: ActorState,
  playerChoice: { text: string },
  recentEvents: GameEvent[],
  validEffectTypes: string[]
): Message[] {
  const player = state.actors.find((a) => a.isPlayer);
  const relationship = state.relationships.find(
    (r) => r.fromActorId === actor.id && r.toActorId === player?.id
  );

  const effectTypeList = validEffectTypes.map((t) => `  - "${t}"`).join("\n");

  const system = `You are simulating the behavior of "${actor.name}" in a strategy simulation.

You do not control numeric values. Express consequences as effect types and intensities only.

You must respond ONLY with valid JSON in this exact format:
{
  "action": "A 1-2 sentence description of what this actor does in response",
  "reasoning": "A brief explanation of their motivation",
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
- Only use effect types from the valid list above. Do NOT invent new effect types.
- Choose 0–2 effects reflecting this actor's response.
- The actor should behave consistently with their traits and goals.
- Consider the relationship with the player when deciding actions.
- Do NOT include numeric values, percentages, or raw deltas.`;

  const recentEventsText =
    recentEvents.length > 0
      ? `\nRecent events:\n${recentEvents.map((e) => `- ${e.description}`).join("\n")}`
      : "";

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
    },
    {
      "type": "worldVariable",
      "target": "Variable Name",
      "field": "value",
      "newValue": "55",
      "reason": "Brief reason"
    }
  ]
}

State change types:
- "resource": change an actor's resource. Use "target" = actor name, "field" = resource name, "delta" = amount to change by
- "worldVariable": change a world variable. Use "target" = variable name, "field" = "value", "newValue" = new value as string

Rules:
- stateChanges must only reference actors/resources/variables that exist in the state
- Resource deltas should be small and proportional (typically -20 to +20 per turn)
- Update world variables when the actor's actions would logically affect them (e.g. military action increases Regional Tension, bandit raids increase Bandit Threat)
- The actor should behave consistently with their traits and goals
- Consider the relationship with the player when deciding actions
- Do not invent new actors, resources, or world variables`;

  const recentEventsText =
    recentEvents.length > 0
      ? `\nRecent events:\n${recentEvents.map((e) => `- ${e.description}`).join("\n")}`
      : "";

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

All actors in this scenario: ${state.actors.map((a) => a.name).join(", ")}
All resource types: ${[...new Set(state.actors.flatMap((a) => a.resources.map((r) => r.name)))].join(", ")}

World variables (can be updated via stateChanges with type "worldVariable"):
${state.worldVariables.map((v) => `- ${v.name}: ${v.value}${v.minValue !== null || v.maxValue !== null ? ` (range: ${v.minValue ?? "?"}–${v.maxValue ?? "?"})` : ""}`).join("\n")}

How does ${actor.name} respond? Consider updating world variables if this actor's actions would affect them. Respond with JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}

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
