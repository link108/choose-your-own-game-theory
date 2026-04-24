import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createScenarioCreationMessageSchema } from "@/lib/api/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import { generateScenarioCreationConversationTurn } from "@/lib/scenario-creation";
import { serializeScenarioCreationSession } from "@/lib/scenario-creation/persistence";
import {
  scenarioCreationWorkingDraftSchema,
} from "@/lib/scenario-creation/schema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = await parseJsonBody(request, createScenarioCreationMessageSchema);
    if (!parsed.success) return parsed.response;

    const session = await db.scenarioCreationSession.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        optionGroups: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Scenario creation session not found" },
        { status: 404 }
      );
    }

    if (session.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Scenario creation session is not active" },
        { status: 400 }
      );
    }

    const userMessage = parsed.data.content.trim();
    const workingDraftResult = scenarioCreationWorkingDraftSchema.safeParse(
      session.workingDraft
    );
    const workingDraft = workingDraftResult.success
      ? workingDraftResult.data
      : null;

    const fullMessages = [
      ...session.messages.map((message) => ({
        role: message.role.toLowerCase() as "user" | "assistant" | "system",
        content: message.content,
      })),
      {
        role: "user" as const,
        content: userMessage,
      },
    ];

    const turn = await generateScenarioCreationConversationTurn({
      workingDraft,
      messages: fullMessages,
    });

    const nextSession = await db.scenarioCreationSession.update({
      where: { id },
      data: {
        sourcePrompt: session.sourcePrompt || userMessage,
        ...(turn.workingDraft.title
          ? { title: turn.workingDraft.title }
          : {}),
        workingDraft: turn.workingDraft as Prisma.InputJsonValue,
        messages: {
          create: [
            {
              role: "USER",
              kind: "CHAT",
              content: userMessage,
            },
            {
              role: "ASSISTANT",
              kind: turn.optionGroup ? "OPTION_PROMPT" : "CHAT",
              content: turn.assistantMessage,
            },
          ],
        },
        optionGroups: turn.optionGroup
          ? {
              create: {
                stage: turn.optionGroup.stage,
                kind: turn.optionGroup.kind,
                title: turn.optionGroup.title,
                description: turn.optionGroup.description,
                selectionMode:
                  turn.optionGroup.selectionMode === "multiple"
                    ? "MULTIPLE"
                    : "SINGLE",
                status: "OPEN",
                options: turn.optionGroup.options as Prisma.InputJsonValue,
              },
            }
          : undefined,
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

    return NextResponse.json(serializeScenarioCreationSession(nextSession));
  } catch (error) {
    console.error("Failed to append scenario creation message:", error);
    return NextResponse.json(
      { error: "Failed to append scenario creation message" },
      { status: 500 }
    );
  }
}
