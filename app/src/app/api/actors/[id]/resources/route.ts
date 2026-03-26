import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: actorId } = await params;
    const body = await request.json();
    const { name, value, minValue, maxValue } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Resource name is required" },
        { status: 400 }
      );
    }

    const resource = await db.actorResource.create({
      data: {
        actorId,
        name,
        value: value ?? 0,
        minValue: minValue ?? 0,
        maxValue: maxValue ?? 9999,
      },
    });

    return NextResponse.json(resource, { status: 201 });
  } catch (error) {
    console.error("Failed to create resource:", error);
    return NextResponse.json(
      { error: "Failed to create resource" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params; // consume params even though we use body for resource ID
    const body = await request.json();
    const { resourceId, name, value, minValue, maxValue } = body;

    if (!resourceId) {
      return NextResponse.json(
        { error: "Resource ID is required" },
        { status: 400 }
      );
    }

    const resource = await db.actorResource.update({
      where: { id: resourceId },
      data: {
        ...(name !== undefined && { name }),
        ...(value !== undefined && { value }),
        ...(minValue !== undefined && { minValue }),
        ...(maxValue !== undefined && { maxValue }),
      },
    });

    return NextResponse.json(resource);
  } catch (error) {
    console.error("Failed to update resource:", error);
    return NextResponse.json(
      { error: "Failed to update resource" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const { searchParams } = new URL(request.url);
    const resourceId = searchParams.get("resourceId");

    if (!resourceId) {
      return NextResponse.json(
        { error: "Resource ID is required" },
        { status: 400 }
      );
    }

    await db.actorResource.delete({ where: { id: resourceId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete resource:", error);
    return NextResponse.json(
      { error: "Failed to delete resource" },
      { status: 500 }
    );
  }
}
