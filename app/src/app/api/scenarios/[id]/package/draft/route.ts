import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateScenarioPackageDraftSchema } from "@/lib/api/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import { generateScenarioPackageDraft } from "@/lib/scenario-dsl/draft-generation";

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = await parseJsonBody(request, generateScenarioPackageDraftSchema);
    if (!parsed.success) return parsed.response;

    const scenario = await db.scenario.findUnique({
      where: { id },
      include: {
        actors: {
          include: {
            resources: true,
            relationshipsFrom: {
              include: {
                toActor: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
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

    const result = await generateScenarioPackageDraft({
      authorPrompt: parsed.data.prompt,
      validationContext: {
        actorIds: scenario.actors.map((actor) => actor.id),
        resourceIds: scenario.actors.flatMap((actor) =>
          actor.resources.map((resource) => resource.id)
        ),
        worldVariableIds: scenario.worldVariables.map((variable) => variable.id),
        relationshipIds: scenario.actors.flatMap((actor) =>
          actor.relationshipsFrom.map((relationship) => relationship.id)
        ),
      },
      scenario: {
        name: scenario.name,
        description: scenario.description,
        worldDescription: scenario.worldDescription,
        actors: scenario.actors.map((actor) => ({
          id: actor.id,
          name: actor.name,
          description: actor.description,
          goals: parseStringArray(actor.goals),
          traits: parseStringArray(actor.traits),
          isPlayer: actor.isPlayer,
          resources: actor.resources.map((resource) => ({
            id: resource.id,
            name: resource.name,
            value: resource.value,
            minValue: resource.minValue,
            maxValue: resource.maxValue,
          })),
          relationshipsFrom: actor.relationshipsFrom.map((relationship) => ({
            id: relationship.id,
            toActorId: relationship.toActorId,
            toActorName: relationship.toActor?.name,
            type: relationship.type,
            strength: relationship.strength,
            description: relationship.description,
          })),
        })),
        worldVariables: scenario.worldVariables.map((variable) => ({
          id: variable.id,
          name: variable.name,
          kind: variable.kind,
          value: variable.value,
          minValue: variable.minValue,
          maxValue: variable.maxValue,
        })),
        existingPackage: scenario.scenarioPackage,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to generate scenario package draft:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate scenario package draft",
      },
      { status: 500 }
    );
  }
}
