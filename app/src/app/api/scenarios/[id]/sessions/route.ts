import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { ScenarioState, WorldVariableKind } from "@/lib/types";
import {
  buildScenarioStateExtensions,
  validateScenarioPackage,
} from "@/lib/scenario-dsl";
import type { ScenarioPackage } from "@/lib/scenario-dsl";

const WORLD_VARIABLE_KINDS = new Set<WorldVariableKind>([
  "resource",
  "countdown",
  "counter",
  "flag",
  "text",
]);

function coerceWorldVariableKind(kind: string): WorldVariableKind {
  return WORLD_VARIABLE_KINDS.has(kind as WorldVariableKind)
    ? (kind as WorldVariableKind)
    : "text";
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Load full scenario data for the state snapshot
    const scenario = await db.scenario.findUnique({
      where: { id },
      include: {
        actors: {
          include: {
            resources: true,
            relationshipsFrom: true,
          },
        },
        worldVariables: true,
      },
    });

    if (!scenario) {
      return NextResponse.json(
        { error: "Scenario not found" },
        { status: 404 }
      );
    }

    // Validate scenario is ready to play
    const playerActors = scenario.actors.filter((a) => a.isPlayer);
    const nonPlayerActors = scenario.actors.filter((a) => !a.isPlayer);

    if (playerActors.length === 0) {
      return NextResponse.json(
        { error: "Scenario must have at least one player actor" },
        { status: 400 }
      );
    }

    if (nonPlayerActors.length === 0) {
      return NextResponse.json(
        { error: "Scenario must have at least one non-player actor" },
        { status: 400 }
      );
    }

    const unnamedActors = scenario.actors.filter((a) => !a.name.trim());
    if (unnamedActors.length > 0) {
      return NextResponse.json(
        { error: "All actors must have names" },
        { status: 400 }
      );
    }

    if (scenario.scenarioPackage === null) {
      return NextResponse.json(
        {
          error:
            "Scenario package is required to start a session. Legacy runtime paths have been removed.",
        },
        { status: 400 }
      );
    }

    const packageValidation = validateScenarioPackage(
      scenario.scenarioPackage,
      {
        actorIds: scenario.actors.map((actor) => actor.id),
        resourceIds: scenario.actors.flatMap((actor) =>
          actor.resources.map((resource) => resource.id)
        ),
        worldVariableIds: scenario.worldVariables.map(
          (variable) => variable.id
        ),
        relationshipIds: scenario.actors.flatMap((actor) =>
          actor.relationshipsFrom.map((relationship) => relationship.id)
        ),
      }
    );

    if (!packageValidation.valid || !packageValidation.package) {
      return NextResponse.json(
        {
          error: "Scenario package is invalid",
          issues: packageValidation.issues,
        },
        { status: 400 }
      );
    }

    const scenarioPackage: ScenarioPackage = packageValidation.package;

    const stateExtensions = buildScenarioStateExtensions(scenarioPackage);

    // Build initial state snapshot
    const initialState: ScenarioState = {
      scenarioId: scenario.id,
      sessionId: "", // will be filled after creation
      turn: 0,
      actors: scenario.actors.map((actor) => ({
        id: actor.id,
        name: actor.name,
        description: actor.description,
        goals: actor.goals as string[],
        traits: actor.traits as string[],
        isPlayer: actor.isPlayer,
        resources: actor.resources.map((r) => ({
          id: r.id,
          name: r.name,
          value: r.value,
          minValue: r.minValue,
          maxValue: r.maxValue,
        })),
      })),
      relationships: scenario.actors.flatMap((actor) =>
        actor.relationshipsFrom.map((r) => ({
          id: r.id,
          fromActorId: r.fromActorId,
          toActorId: r.toActorId,
          type: r.type,
          strength: r.strength,
          description: r.description,
        }))
      ),
      worldVariables: scenario.worldVariables.map((v) => ({
        id: v.id,
        name: v.name,
        value: v.value,
        kind: coerceWorldVariableKind(v.kind),
        minValue: v.minValue,
        maxValue: v.maxValue,
        config: v.config as { step?: number } | null | undefined,
      })),
      scenarioObjectTypes: stateExtensions.scenarioObjectTypes,
      scenarioObjects: stateExtensions.scenarioObjects,
      eventHistory: [],
    };

    // Create session
    const session = await db.gameSession.create({
      data: {
        scenarioId: scenario.id,
        turn: 0,
        state: JSON.parse(JSON.stringify(initialState)),
        status: "ACTIVE",
      },
    });

    // Update sessionId in state
    initialState.sessionId = session.id;
    await db.gameSession.update({
      where: { id: session.id },
      data: {
        state: JSON.parse(JSON.stringify(initialState)),
      },
    });

    // Mark scenario as active
    await db.scenario.update({
      where: { id },
      data: { status: "ACTIVE" },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}
