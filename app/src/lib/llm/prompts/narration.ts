import type {
  PageData,
  ResolverSummary,
} from "@/lib/types";
import type {
  NarrationActorAction,
  NarrationStateChange,
} from "@/lib/simulation/narrative-grounding";
import type { Message } from "../types";

export function buildNarrationPrompt(
  playerChoice: { text: string },
  actorResponses: NarrationActorAction[],
  stateChanges: NarrationStateChange[],
  visibleEvents: Array<{
    type: string;
    description: string;
  }>,
  stateSummary: PageData["stateSummary"],
  resolverSummary?: ResolverSummary
): Message[] {
  const clampedNote = resolverSummary && resolverSummary.clamped.length > 0
    ? `\n- Fields that hit their limits this turn (use for dramatic tension): ${resolverSummary.clamped.join(", ")}`
    : "";

  const system = `You are a narrative writer for an interactive strategy simulation. You produce structured JSON describing what happened this turn.

You must respond ONLY with valid JSON in this exact format:
{
  "playerAction": "1-2 paragraphs describing what the player did and the immediate result. Second person (You...).",
  "consequences": "1-2 paragraphs describing the consequences and ripple effects of the player's action.",
  "otherActions": [
    {
      "actor": "Actor Name",
      "description": "1-2 sentences describing what this actor did and why.",
      "order": 1
    }
  ],
  "worldUpdate": "1 paragraph summarizing how the broader situation has shifted. Reference specific world variable changes if relevant."
}

Style:
- Vivid but concise prose
- Second person for player sections ("You...")
- Third person for other actors
- Reference only committed facts provided below
- Build tension and stakes
- otherActions should be ordered by narrative importance (most impactful first)
- Do NOT invent hidden motives, secret actions, unseen entities, or state changes not listed in the committed facts
- Do NOT mention hidden objects, unrevealed fields, or internal trigger-rule mechanics unless they appear explicitly in the committed facts
- If committed facts are sparse, keep the prose sparse rather than adding speculation${clampedNote}`;

  const actorActionsText = actorResponses
    .map((r) => `- ${r.actorName}: ${r.action}`)
    .join("\n");

  const changesText = stateChanges
    .map((c) => {
      if (c.type === "resource") {
        const delta = typeof c.newValue === "number" && typeof c.oldValue === "number"
          ? c.newValue - c.oldValue : null;
        return `- [resource] ${c.target}'s ${c.field}: ${delta !== null ? (delta > 0 ? "+" : "") + delta : "→ " + c.newValue} (${c.reason})`;
      }
      return `- [${c.type}] ${c.target}: ${c.oldValue} → ${c.newValue} (${c.reason})`;
    })
    .join("\n");

  const eventText = visibleEvents
    .map((event) => `- [${event.type}] ${event.description}`)
    .join("\n");

  const worldContext = stateSummary.worldState
    .map((v) => `${v.name}: ${v.value}`)
    .join(", ");

  const objectContext = (stateSummary.scenarioObjects ?? [])
    .map((object) => {
      const fieldSummary = Object.entries(object.fields)
        .map(([field, value]) => `${field}: ${String(value)}`)
        .join(", ");
      return `- ${object.name} (${object.typeLabel})${fieldSummary ? ` — ${fieldSummary}` : ""}`;
    })
    .join("\n");

  const userMessage = `Committed turn facts

Player choice:
- ${playerChoice.text}

Validated actor actions:
${actorActionsText || "None"}

Visible committed state changes:
${changesText || "None"}

Committed visible events:
${eventText || "None"}

Visible world state now:
${worldContext || "None"}

Visible scenario objects now:
${objectContext || "None"}

Active tensions:
${stateSummary.activeTensions.map((tension) => `- ${typeof tension === "string" ? tension : tension.text}`).join("\n") || "None"}

Write the structured narrative for this turn. JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: userMessage },
  ];
}
