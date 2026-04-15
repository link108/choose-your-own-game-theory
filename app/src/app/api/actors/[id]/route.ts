import { db } from "@/lib/db";
import { updateActorSchema } from "@/lib/api/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await db.actor.findUnique({
      where: { id },
      include: {
        resources: true,
        relationshipsFrom: true,
        relationshipsTo: true,
      },
    });

    if (!actor) {
      return NextResponse.json({ error: "Actor not found" }, { status: 404 });
    }

    return NextResponse.json(actor);
  } catch (error) {
    console.error("Failed to fetch actor:", error);
    return NextResponse.json(
      { error: "Failed to fetch actor" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = await parseJsonBody(request, updateActorSchema);
    if (!parsed.success) return parsed.response;
    const { name, description, goals, traits, isPlayer } = parsed.data;

    const actor = await db.actor.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(goals !== undefined && { goals }),
        ...(traits !== undefined && { traits }),
        ...(isPlayer !== undefined && { isPlayer }),
      },
      include: { resources: true },
    });

    return NextResponse.json(actor);
  } catch (error) {
    console.error("Failed to update actor:", error);
    return NextResponse.json(
      { error: "Failed to update actor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.actor.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete actor:", error);
    return NextResponse.json(
      { error: "Failed to delete actor" },
      { status: 500 }
    );
  }
}
