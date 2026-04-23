import type { ScenarioState, Choice } from "@/lib/types";
import type { ScenarioPackage } from "@/lib/scenario-dsl";
import type { Message } from "../types";

interface ChoicePromptOptions {
  previousChoices?: Choice[];
  excludedChoices?: Choice[];
  scenarioPackage?: ScenarioPackage;
  suggestedAction?: string;
  rejectedChoices?: Array<{
    text: string;
    reasons: string[];
    executionError?: string;
  }>;
}

export function buildChoiceGenerationPrompt(
  state: ScenarioState,
  playerChoiceThisTurn?: { text: string },
  options: ChoicePromptOptions = {}
): Message[] {
  const {
    previousChoices,
    excludedChoices,
    scenarioPackage,
    suggestedAction,
    rejectedChoices,
  } = options;
  const player = state.actors.find((a) => a.isPlayer);
  const npcs = state.actors.filter((a) => !a.isPlayer);
  const visibleObjects =
    state.scenarioObjects?.filter((object) => object.visibility !== "hidden") ?? [];
  const formatBlock = scenarioPackage
    ? `{
  "choices": [
    {
      "id": "unique_snake_case_id",
      "text": "Short action label (5-10 words)",
      "description": "What this means and likely consequences (1-2 sentences)",
      "debugReasoning": "Brief high-level rationale for why this choice makes sense right now",
      "execution": {
        "kind": "scenario_effect",
        "invocation": {
          "effectId": "scenario_effect_id",
          "intensity": "valid_intensity_for_effect",
          "bindings": {
            "parameterName": "entity_id"
          }
        }
      }
    }
  ]
}`
    : `{
  "choices": [
    {
      "id": "unique_snake_case_id",
      "text": "Short action label (5-10 words)",
      "description": "What this means and likely consequences (1-2 sentences)",
      "debugReasoning": "Brief high-level rationale for why this choice makes sense right now"
    }
  ]
}`;

  const system = `You generate choices for an interactive strategy simulation. Output ONLY valid JSON.

Format:
${formatBlock}

Rules:
- Generate ${scenarioPackage?.choicePolicy.minChoices ?? 3}-${scenarioPackage?.choicePolicy.maxChoices ?? 5} choices
- Each choice must be distinct and meaningful
- Choices should vary in risk/reward
- At least one diplomatic and one assertive option
- Choices must be VALID given the current state — check the event history
- Do NOT offer actions that are already done (e.g. if a pact was already signed, don't offer to sign it again)
- Recurring actions are fine (e.g. "negotiate with X" can appear again if it makes sense)
- Reference actual actors and resources by name
- If you include execution, use only an intensity that is actually defined for that effect
- In execution.invocation.bindings, ALWAYS use canonical ids from the state data, never display names or labels
- Invalid example: { "actor": "Duke Aldric of Valdris", "location": "Central Pass" }
- Valid example: { "actor": "actor_valdris_aldric", "location": "object_central_pass" }
- If provided, debugReasoning must be a short, high-level explanation of the option's immediate strategic rationale
- Do not expose hidden state or internal chain-of-thought in debugReasoning`;

  const packageSection = scenarioPackage
    ? `

Scenario package guidance:
- Preferred effect families: ${(scenarioPackage.choicePolicy.preferredEffectIds ?? []).join(", ") || "none listed"}
- Guidance: ${scenarioPackage.choicePolicy.guidance ?? "none"}
- Actor ids:
${state.actors.map((actor) => `  - ${actor.name} (id: ${actor.id})`).join("\n") || "  None"}
- Visible scenario objects:
${visibleObjects.map((object) => `  - ${object.name} (id: ${object.id}, type: ${object.typeId})`).join("\n") || "  None"}
- Available scenario effects:
${scenarioPackage.effectDefinitions
  .map((effect) => {
    const params = Object.entries(effect.parameters ?? {})
      .map(([name, def]) =>
        def.type === "object" && def.objectType
          ? `${name}:${def.type}<${def.objectType}>${def.required === false ? "?" : ""}`
          : `${name}:${def.type}${def.required === false ? "?" : ""}`
      )
      .join(", ");
    const intensities = Object.keys(effect.intensities).join(", ") || "none";
    return `  - ${effect.id}: ${effect.description}${params ? ` | bindings: ${params}` : ""} | valid intensities: ${intensities}`;
  })
  .join("\n")}
- Binding rule: every execution binding value must be one of the ids listed above for the matching entity type.`
    : "";

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

  const excludedChoicesText = excludedChoices?.length
    ? `\nChoices already shown on this page or rejected for regeneration (avoid returning these exact labels):\n${excludedChoices.map((c) => `- "${c.text}"`).join("\n")}`
    : "";

  const justDidText = playerChoiceThisTurn
    ? `\nThe player JUST chose: "${playerChoiceThisTurn.text}" — generate choices that follow from this action, not repeat it.`
    : "";

  const suggestionText = suggestedAction?.trim()
    ? `\nPlayer-suggested action idea: "${suggestedAction.trim()}". Use it only as directional guidance for regeneration. Do not restate it verbatim or return it as a standalone choice unless the state has materially advanced beyond that exact action.`
    : "";

  const rejectionFeedbackText = rejectedChoices?.length
    ? `\nRetry guidance from the previous failed attempt:
${rejectedChoices
  .map((choice) => {
    const detail = choice.executionError ? `; ${choice.executionError}` : "";
    return `- Do not return "${choice.text}" again: ${choice.reasons.join(", ")}${detail}`;
  })
  .join("\n")}`
    : "";

  const userMessage = `Current state (Turn ${state.turn}):

Player: ${player?.name}
Resources: ${player?.resources.map((r) => `${r.name}: ${r.value}`).join(", ")}

Other actors:
${npcs.map((a) => `- ${a.name}: Resources: ${a.resources.map((r) => `${r.name}: ${r.value}`).join(", ")}`).join("\n")}

Relationships:
${relationships || "  None defined"}

World variables: ${state.worldVariables.map((v) => `${v.name}: ${v.value}`).join(", ")}
${packageSection}

Event history:
${recentEvents || "  None yet"}
${previousChoicesText}
${excludedChoicesText}
${justDidText}
${suggestionText}
${rejectionFeedbackText}

Generate NEW choices for the player based on the current situation. ${
    scenarioPackage
      ? "When possible, include an execution block that maps the choice to a valid scenario effect and valid bindings."
      : ""
  } Include debugReasoning only as a brief summary, not private reasoning. JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
