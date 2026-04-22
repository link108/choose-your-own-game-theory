import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseOptionalJsonBody } from "@/lib/api/validation";
import { regenerateChoicesSchema } from "@/lib/api/schemas";
import {
  buildValidationContextFromState,
  validateScenarioPackage,
} from "@/lib/scenario-dsl";
import { getLLMChoices } from "@/lib/llm/game-llm";
import { buildRuntimeAlertFromCode } from "@/lib/runtime-feedback";
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

    if (!scenario?.scenarioPackage) {
      return NextResponse.json(
        {
          error:
            "Scenario package is required to regenerate choices. Legacy runtime paths have been removed.",
        },
        { status: 400 }
      );
    }

    const validatedScenarioPackage = validateScenarioPackage(
      scenario.scenarioPackage,
      buildValidationContextFromState(state)
    );

    if (!validatedScenarioPackage.valid || !validatedScenarioPackage.package) {
      return NextResponse.json(
        {
          error:
            "Scenario package is invalid for choice regeneration. Fix the package before regenerating choices.",
          issues: validatedScenarioPackage.issues,
        },
        { status: 400 }
      );
    }

    let regeneratedChoices: Choice[];
    try {
      regeneratedChoices = await getLLMChoices(
        state,
        lastTurn.playerChoiceText ? { text: lastTurn.playerChoiceText } : undefined,
        currentChoices,
        validatedScenarioPackage.package,
        parsed.data.suggestedAction
      );
    } catch (error) {
      const runtimeNote =
        typeof lastTurn.resolverLog === "object" &&
        lastTurn.resolverLog !== null &&
        typeof (lastTurn.resolverLog as { runtime?: { note?: unknown } }).runtime?.note ===
          "string"
          ? ((lastTurn.resolverLog as { runtime?: { note?: string } }).runtime?.note ?? undefined)
          : undefined;

      return NextResponse.json(
        {
          error: "Choice regeneration failed",
          code: "choice_regeneration_failed",
          stage: "choice_regeneration",
          retryable: true,
          details:
            error instanceof Error ? error.message : "Failed to regenerate choices",
          runtimeNote,
          runtimeAlert: buildRuntimeAlertFromCode("choice_regeneration_failed"),
          runtimeAlerts: runtimeNote
            ? [buildRuntimeAlertFromCode(runtimeNote)]
            : [],
        },
        { status: 502 }
      );
    }

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
