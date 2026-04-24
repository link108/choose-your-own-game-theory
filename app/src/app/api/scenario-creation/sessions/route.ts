import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createScenarioCreationSessionSchema,
} from "@/lib/api/schemas";
import { parseOptionalJsonBody } from "@/lib/api/validation";
import { serializeScenarioCreationSession } from "@/lib/scenario-creation/persistence";

export async function POST(request: Request) {
  try {
    const parsed = await parseOptionalJsonBody(
      request,
      createScenarioCreationSessionSchema,
      {}
    );
    if (!parsed.success) return parsed.response;

    const initialPrompt = parsed.data.initialPrompt?.trim() ?? "";

    const session = await db.scenarioCreationSession.create({
      data: {
        sourcePrompt: initialPrompt,
        workingDraft: {
          premise: initialPrompt || undefined,
          actorIdeas: [],
          worldVariableIdeas: [],
          notes: [],
          builderDraft: null,
        },
        messages: {
          create: [
            {
              role: "ASSISTANT",
              kind: "CHAT",
              content:
                "Tell me what kind of scenario you want to create. I can help frame the premise, suggest options, and build a draft before anything becomes canonical.",
            },
          ],
        },
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        optionGroups: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json(serializeScenarioCreationSession(session), {
      status: 201,
    });
  } catch (error) {
    console.error("Failed to create scenario creation session:", error);
    return NextResponse.json(
      { error: "Failed to create scenario creation session" },
      { status: 500 }
    );
  }
}
