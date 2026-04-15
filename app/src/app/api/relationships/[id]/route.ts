import { db } from "@/lib/db";
import { updateRelationshipSchema } from "@/lib/api/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import { NextResponse } from "next/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = await parseJsonBody(request, updateRelationshipSchema);
    if (!parsed.success) return parsed.response;
    const { type, strength, description } = parsed.data;

    const relationship = await db.actorRelationship.update({
      where: { id },
      data: {
        ...(type !== undefined && { type }),
        ...(strength !== undefined && { strength }),
        ...(description !== undefined && { description }),
      },
    });

    return NextResponse.json(relationship);
  } catch (error) {
    console.error("Failed to update relationship:", error);
    return NextResponse.json(
      { error: "Failed to update relationship" },
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
    await db.actorRelationship.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete relationship:", error);
    return NextResponse.json(
      { error: "Failed to delete relationship" },
      { status: 500 }
    );
  }
}
