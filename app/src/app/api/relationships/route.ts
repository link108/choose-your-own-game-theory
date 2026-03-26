import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fromActorId, toActorId, type, strength, description } = body;

    if (!fromActorId || !toActorId) {
      return NextResponse.json(
        { error: "Both actor IDs are required" },
        { status: 400 }
      );
    }

    if (fromActorId === toActorId) {
      return NextResponse.json(
        { error: "Cannot create relationship with self" },
        { status: 400 }
      );
    }

    const relationship = await db.actorRelationship.create({
      data: {
        fromActorId,
        toActorId,
        type: type ?? "neutral",
        strength: strength ?? 50,
        description: description ?? null,
      },
    });

    return NextResponse.json(relationship, { status: 201 });
  } catch (error) {
    console.error("Failed to create relationship:", error);
    return NextResponse.json(
      { error: "Failed to create relationship" },
      { status: 500 }
    );
  }
}
