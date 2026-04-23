import { db } from "@/lib/db";
import { diagnoseScenarioPackage, validateScenarioPackage } from "@/lib/scenario-dsl";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    if (scenario.scenarioPackage === null) {
      return NextResponse.json({
        valid: false,
        issues: [
          {
            severity: "warning",
            path: "scenarioPackage",
            message: "No scenario package has been generated yet",
          },
        ],
        diagnostics: [],
      });
    }

    const validation = validateScenarioPackage(scenario.scenarioPackage, {
      actorIds: scenario.actors.map((actor) => actor.id),
      resourceIds: scenario.actors.flatMap((actor) =>
        actor.resources.map((resource) => resource.id)
      ),
      worldVariableIds: scenario.worldVariables.map((variable) => variable.id),
      relationshipIds: scenario.actors.flatMap((actor) =>
        actor.relationshipsFrom.map((relationship) => relationship.id)
      ),
    });

    return NextResponse.json({
      valid: validation.valid,
      issues: validation.issues,
      diagnostics: validation.package
        ? diagnoseScenarioPackage(validation.package, {
            actorIds: scenario.actors.map((actor) => actor.id),
            resourceIds: scenario.actors.flatMap((actor) =>
              actor.resources.map((resource) => resource.id)
            ),
            worldVariableIds: scenario.worldVariables.map((variable) => variable.id),
            relationshipIds: scenario.actors.flatMap((actor) =>
              actor.relationshipsFrom.map((relationship) => relationship.id)
            ),
          }).diagnostics
        : [],
    });
  } catch (error) {
    console.error("Failed to validate scenario package:", error);
    return NextResponse.json(
      { error: "Failed to validate scenario package" },
      { status: 500 }
    );
  }
}
