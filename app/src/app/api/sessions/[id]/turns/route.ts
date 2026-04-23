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
import { buildRuntimeAlertFromCode, mergeRuntimeAlerts } from "@/lib/runtime-feedback";
import type { ResolverDebug, RuntimeAlert, ScenarioState, Choice } from "@/lib/types";
import { ChoiceGenerationError } from "@/lib/llm/game-llm";

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
      let page: Awaited<ReturnType<typeof generateInitialPage>>;
      try {
        page = await generateInitialPage(state);
      } catch (error) {
        return NextResponse.json(
          {
            error: "Initial page generation failed",
            code: "initial_page_generation_failed",
            stage: "initial_page",
            retryable: true,
            details:
              error instanceof Error ? error.message : "Failed to generate initial page",
            runtimeAlert: buildRuntimeAlertFromCode("initial_page_generation_failed"),
          },
          { status: 502 }
        );
      }

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

    let generatedPage: Awaited<ReturnType<typeof generatePage>>;
    try {
      const takenChoices: Choice[] = turnsToTakenChoices(
        await db.turn.findMany({
          where: { sessionId: id },
          orderBy: { turnNumber: "asc" },
          select: {
            playerChoiceId: true,
            playerChoiceText: true,
          },
        })
      );
      generatedPage = await generatePage(
        turnResult,
        state,
        takenChoices,
        validatedScenarioPackage.package
      );
    } catch (error) {
      const runtimeNote = turnResult.resolverSummary?.runtimeNote;
      return NextResponse.json(
        {
          error: "Next page generation failed",
          code: "page_choice_generation_failed",
          stage: "choice_generation",
          retryable: true,
          details:
            error instanceof Error ? error.message : "Failed to generate next page",
          ...(error instanceof ChoiceGenerationError
            ? { trace: error.trace }
            : {}),
          runtimeNote,
          runtimeAlert: buildRuntimeAlertFromCode("page_choice_generation_failed"),
          runtimeAlerts: runtimeNote
            ? [buildRuntimeAlertFromCode(runtimeNote)]
            : [],
        },
        { status: 502 }
      );
    }

    const mergedResolverDebug = mergeGeneratedPageRuntime(
      turnResult.resolverDebug,
      generatedPage.runtimeAlerts,
      generatedPage.narrationSource
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
        ...(mergedResolverDebug
          ? { resolverLog: JSON.parse(JSON.stringify(mergedResolverDebug)) }
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
            title: generatedPage.page.title,
            narrative: JSON.stringify(generatedPage.page.narrative),
            stateSummary: JSON.parse(JSON.stringify(generatedPage.page.stateSummary)),
            choices: JSON.parse(JSON.stringify(generatedPage.page.choices)),
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

    const response: Record<string, unknown> = { turn, page: generatedPage.page };
    if (process.env.NODE_ENV === "development") {
      if (mergedResolverDebug) {
        response.resolverDebug = mergedResolverDebug;
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

function turnsToTakenChoices(
  turns: Array<{ playerChoiceId: string | null; playerChoiceText: string | null }>
): Choice[] {
  return turns
    .filter((turn) => typeof turn.playerChoiceText === "string" && turn.playerChoiceText.length > 0)
    .map((turn, index) => ({
      id: turn.playerChoiceId ?? `taken_choice_${index + 1}`,
      text: turn.playerChoiceText as string,
      description: turn.playerChoiceText as string,
    }));
}

function mergeGeneratedPageRuntime(
  resolverDebug: ResolverDebug | undefined,
  runtimeAlerts: RuntimeAlert[],
  narrationSource: "llm" | "fallback"
): ResolverDebug | undefined {
  if (!resolverDebug && runtimeAlerts.length === 0 && narrationSource === "llm") {
    return undefined;
  }

  return {
    ...(resolverDebug ?? {
      effectsReceived: [],
      effectsApplied: [],
      effectsRejected: [],
      constraintsApplied: [],
    }),
    runtime: {
      path: "scenario_package",
      ...(resolverDebug?.runtime?.note ? { note: resolverDebug.runtime.note } : {}),
      narrationSource,
      alerts: mergeRuntimeAlerts(resolverDebug?.runtime?.alerts, runtimeAlerts),
    },
  };
}
