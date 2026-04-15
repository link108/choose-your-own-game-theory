import type { ScenarioState } from "@/lib/types";
import type { Message } from "../types";
import type { ScenarioPromptConfig, EntityLookupMap } from "../../simulation/proposals";
import { buildEntityLookupMap } from "../../simulation/proposals";

/**
 * Options for building choice effects prompts with proposals.
 */
export interface ChoiceProposalPromptOptions {
  state: ScenarioState;
  playerChoice: { text: string };
  promptConfig?: ScenarioPromptConfig | null;
}

/**
 * Build an entity reference section for the prompt.
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
    lines.push(`- actorId: "${actor.id}" (${actor.name}${actor.isPlayer ? " [PLAYER]" : ""})`);
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
 * Proposal-based choice effects prompt.
 * Returns { proposals: ProposedStateChange[] }.
 */
export function buildChoiceEffectsProposalPrompt(
  options: ChoiceProposalPromptOptions
): Message[] {
  const { state, playerChoice, promptConfig } = options;

  const player = state.actors.find((a) => a.isPlayer);
  const entityMap = buildEntityLookupMap(state);
  const entitySection = buildEntityReferenceSection(state, entityMap);

  // Build effect type descriptions if available
  const effectDescriptions = promptConfig?.effectTypeDescriptions
    ? Object.entries(promptConfig.effectTypeDescriptions)
        .map(([type, desc]) => `  - "${type}": ${desc}`)
        .join("\n")
    : "";

  // Scenario context
  const scenarioContext = promptConfig?.scenarioContext
    ? `\nScenario context: ${promptConfig.scenarioContext}`
    : "";

  const system = `You are analyzing the direct consequences of a player's action in a strategy simulation.

You do not control numeric values directly. Instead, propose structured changes using IDs.

You must respond ONLY with valid JSON in this exact format:
{
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

## Rules
- Use ONLY the IDs listed in the entity reference below
- Choose 0-3 proposals that DIRECTLY result from the player's action
- Do NOT include numeric values, percentages, or raw deltas
- Focus on immediate consequences, not secondary effects

${entitySection}`;

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

What are the direct consequences of this choice? Use entity IDs from the reference. Respond with JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}

/**
 * Legacy choice effects prompt (SemanticEffect format).
 */
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
