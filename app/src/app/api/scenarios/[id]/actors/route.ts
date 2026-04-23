import { db } from "@/lib/db";
import { createActorSchema } from "@/lib/api/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actors = await db.actor.findMany({
      where: { scenarioId: id },
      include: {
        resources: true,
        relationshipsFrom: true,
        relationshipsTo: true,
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(actors);
  } catch (error) {
    console.error("Failed to fetch actors:", error);
    return NextResponse.json(
      { error: "Failed to fetch actors" },
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
    const parsed = await parseJsonBody(request, createActorSchema);
    if (!parsed.success) return parsed.response;
    const { name, description, goals, traits, isPlayer, resources } = parsed.data;

    const actor = await db.actor.create({
      data: {
        scenarioId: id,
        name,
        description: description ?? "",
        goals: goals ?? [],
        traits: traits ?? [],
        isPlayer: isPlayer ?? false,
        resources: resources?.length
          ? {
              create: resources.map((r) => ({
                name: r.name,
                value: r.value ?? 0,
                minValue: r.minValue ?? 0,
                maxValue: r.maxValue ?? 9999,
              })),
            }
          : undefined,
      },
      include: { resources: true },
    });

    return NextResponse.json(actor, { status: 201 });
  } catch (error) {
    console.error("Failed to create actor:", error);
    return NextResponse.json(
      { error: "Failed to create actor" },
      { status: 500 }
    );
  }
}
