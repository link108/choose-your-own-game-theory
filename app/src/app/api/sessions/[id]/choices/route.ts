import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseOptionalJsonBody } from "@/lib/api/validation";
import { regenerateChoicesSchema } from "@/lib/api/schemas";
import {
  buildValidationContextFromState,
  validateScenarioPackage,
} from "@/lib/scenario-dsl";
import { getLLMChoices } from "@/lib/llm/game-llm";
import type { Choice, ScenarioState } from "@/lib/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = await parseOptionalJsonBody(request, regenerateChoicesSchema, {});
    if (!parsed.success) return parsed.response;

    const session = await db.gameSession.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Session is not active" },
        { status: 400 }
      );
    }

    const lastTurn = await db.turn.findFirst({
      where: { sessionId: id },
      orderBy: { turnNumber: "desc" },
      include: { renderedPage: true },
    });

    if (!lastTurn?.renderedPage) {
      return NextResponse.json(
        { error: "No rendered page available to regenerate choices for" },
        { status: 400 }
      );
    }

    const state = session.state as unknown as ScenarioState;
    const currentChoices = (lastTurn.renderedPage.choices ?? []) as unknown as Choice[];

    const scenario = await db.scenario.findUnique({
      where: { id: session.scenarioId },
      select: {
        scenarioPackage: true,
      },
    });

    const validatedScenarioPackage = scenario?.scenarioPackage
      ? validateScenarioPackage(
          scenario.scenarioPackage,
          buildValidationContextFromState(state)
        )
      : null;

    const regeneratedChoices = await getLLMChoices(
      state,
      lastTurn.playerChoiceText ? { text: lastTurn.playerChoiceText } : undefined,
      currentChoices,
      validatedScenarioPackage?.valid ? validatedScenarioPackage.package : undefined,
      parsed.data.suggestedAction
    );

    await db.renderedPage.update({
      where: { id: lastTurn.renderedPage.id },
      data: {
        choices: JSON.parse(JSON.stringify(regeneratedChoices)),
      },
    });

    return NextResponse.json({
      choices: regeneratedChoices,
    });
  } catch (error) {
    console.error("Failed to regenerate choices:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to regenerate choices",
      },
      { status: 500 }
    );
  }
}
