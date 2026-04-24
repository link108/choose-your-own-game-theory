import type { Message } from "../types";
import type { ScenarioCreationWorkingDraft } from "@/lib/scenario-creation/schema";

export function buildScenarioCreationConversationPrompt(args: {
  workingDraft: ScenarioCreationWorkingDraft | null;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
}): Message[] {
  const recentMessages = args.messages
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  const system = `You help a user co-design a choose-your-own-adventure simulation scenario.

Output ONLY valid JSON.

Return exactly one object with this shape:
{
  "message": "assistant reply to the user",
  "optionGroup": {
    "stage": "collect_intent|frame_mode|define_actors|define_world|define_conflict|define_player_role|review",
    "kind": "scenario_mode|actor_set|world_variable|player_role|conflict_frame",
    "title": "short title",
    "description": "optional short description",
    "selectionMode": "single" | "multiple",
    "options": [
      {
        "id": "stable_snake_case_id",
        "label": "short label",
        "description": "optional short description",
        "payload": {
          "key": "value"
        }
      }
    ]
  },
  "workingDraftPatch": {
    "premise": "optional",
    "title": "optional",
    "genre": "optional",
    "mode": "optional",
    "realismLevel": "optional",
    "playerRole": "optional",
    "initialConflict": "optional",
    "actorIdeas": [
      { "id": "stable_snake_case_id", "name": "Actor Name", "role": "optional" }
    ],
    "worldVariableIdeas": [
      { "id": "stable_snake_case_id", "name": "Variable Name", "kind": "optional" }
    ],
    "notes": ["optional note"]
  }
}

Rules:
- The user is co-designing the scenario with you.
- Do not create a canonical scenario or claim anything has been saved.
- Ask one useful next-step question or give one concise recommendation.
- Include at most one optionGroup.
- Only include workingDraftPatch fields that are safe inferences from the conversation so far.
- If the user expresses a concrete premise, preserve it in workingDraftPatch.premise.
- Prefer structured options when there are a few good alternatives.
- Keep the tone practical and concise.`;

  const user = `Current non-canonical working draft:
${JSON.stringify(args.workingDraft ?? {}, null, 2)}

Conversation:
${recentMessages || "USER: I want help creating a scenario."}

Respond with JSON only.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
