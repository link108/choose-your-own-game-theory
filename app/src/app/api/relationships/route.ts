import { db } from "@/lib/db";
import { createRelationshipSchema } from "@/lib/api/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, createRelationshipSchema);
    if (!parsed.success) return parsed.response;
    const { fromActorId, toActorId, type, strength, description } = parsed.data;

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
