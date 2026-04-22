import { db } from "@/lib/db";
import { resolveTurnSchema } from "@/lib/api/schemas";
import { parseOptionalJsonBody } from "@/lib/api/validation";
import {
  buildValidationContextFromState,
  validateScenarioPackage,
} from "@/lib/scenario-dsl";
import { NextResponse } from "next/server";
import { resolveTurn, generatePage, generateInitialPage } from "@/lib/simulation/engine";
import type { TurnResultWithProposals } from "@/lib/simulation/engine";
import type { ScenarioState, Choice } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const turns = await db.turn.findMany({
      where: { sessionId: id },
      include: {
        renderedPage: true,
        actorResponses: true,
      },
      orderBy: { turnNumber: "asc" },
    });

    return NextResponse.json(turns);
  } catch (error) {
    console.error("Failed to fetch turns:", error);
    return NextResponse.json(
      { error: "Failed to fetch turns" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = await parseOptionalJsonBody(request, resolveTurnSchema, {});
    if (!parsed.success) return parsed.response;
    const { choiceId } = parsed.data;

    // Load session
    const session = await db.gameSession.findUnique({
      where: { id },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Session is not active" },
        { status: 400 }
      );
    }

    const state = session.state as unknown as ScenarioState;

    // Handle turn 0 — generate initial page
    if (session.turn === 0 && !choiceId) {
      const page = await generateInitialPage(state);

      // Create turn 0 record
      const turn = await db.turn.create({
        data: {
          sessionId: id,
          turnNumber: 0,
          stateChanges: JSON.parse("[]"),
          events: JSON.parse("[]"),
          renderedPage: {
            create: {
              title: page.title,
              narrative: JSON.stringify(page.narrative),
              stateSummary: JSON.parse(JSON.stringify(page.stateSummary)),
              choices: JSON.parse(JSON.stringify(page.choices)),
            },
          },
        },
        include: { renderedPage: true },
      });

      return NextResponse.json({
        turn,
        page,
      });
    }

    // Normal turn — need a choice
    if (!choiceId) {
      return NextResponse.json(
        { error: "Choice ID is required" },
        { status: 400 }
      );
    }

    // Get the available choices from the last rendered page
    const lastTurn = await db.turn.findFirst({
      where: { sessionId: id },
      orderBy: { turnNumber: "desc" },
      include: { renderedPage: true },
    });

    const availableChoices = (lastTurn?.renderedPage?.choices ?? []) as unknown as Choice[];
    const selectedChoice = availableChoices.find((c) => c.id === choiceId);

    if (!selectedChoice) {
      return NextResponse.json(
        { error: `Invalid choice: "${choiceId}"` },
        { status: 400 }
      );
    }

    // Load the scenario package for runtime validation
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
            "Scenario package is required for turn resolution. Legacy runtime paths have been removed.",
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
            "Scenario package is invalid for turn resolution. Fix the package before continuing the session.",
          issues: validatedScenarioPackage.issues,
        },
        { status: 400 }
      );
    }

    // Resolve the turn
    const turnResult = await resolveTurn(
      state,
      selectedChoice,
      availableChoices,
      {
        scenarioPackage: validatedScenarioPackage.package,
      }
    ) as TurnResultWithProposals;

    const page = await generatePage(
      turnResult,
      state,
      availableChoices,
      validatedScenarioPackage.package
    );

    // Persist turn (including proposals and resolverLog when available)
    const turn = await db.turn.create({
      data: {
        sessionId: id,
        turnNumber: turnResult.turn,
        playerChoiceId: selectedChoice.id,
        playerChoiceText: selectedChoice.text,
        stateChanges: JSON.parse(JSON.stringify(turnResult.stateChanges)),
        events: JSON.parse(JSON.stringify(turnResult.events)),
        ...(turnResult.proposals
          ? { proposals: JSON.parse(JSON.stringify(turnResult.proposals)) }
          : {}),
        ...(turnResult.resolverDebug
          ? { resolverLog: JSON.parse(JSON.stringify(turnResult.resolverDebug)) }
          : {}),
        actorResponses: {
          create: turnResult.actorResponses.map((r) => ({
            actorId: r.actorId,
            action: r.action,
            reasoning: r.reasoning,
          })),
        },
        renderedPage: {
          create: {
            title: page.title,
            narrative: JSON.stringify(page.narrative),
            stateSummary: JSON.parse(JSON.stringify(page.stateSummary)),
            choices: JSON.parse(JSON.stringify(page.choices)),
          },
        },
      },
      include: { renderedPage: true, actorResponses: true },
    });

    // Update session state
    await db.gameSession.update({
      where: { id },
      data: {
        turn: turnResult.turn,
        state: JSON.parse(JSON.stringify(turnResult.newState)),
      },
    });

    const response: Record<string, unknown> = { turn, page };
    if (process.env.NODE_ENV === "development") {
      if (turnResult.resolverDebug) {
        response.resolverDebug = turnResult.resolverDebug;
      }
      if (turnResult.proposals) {
        response.proposals = turnResult.proposals;
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to resolve turn:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve turn" },
      { status: 500 }
    );
  }
}
