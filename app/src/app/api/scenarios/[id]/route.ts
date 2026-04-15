import { db } from "@/lib/db";
import { updateScenarioSchema } from "@/lib/api/schemas";
import { parseJsonBody } from "@/lib/api/validation";
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
        sessions: {
          orderBy: { updatedAt: "desc" },
          take: 5,
        },
      },
    });

    if (!scenario) {
      return NextResponse.json(
        { error: "Scenario not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(scenario);
  } catch (error) {
    console.error("Failed to fetch scenario:", error);
    return NextResponse.json(
      { error: "Failed to fetch scenario" },
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
    const parsed = await parseJsonBody(request, updateScenarioSchema);
    if (!parsed.success) return parsed.response;
    const { name, description, worldDescription, status } = parsed.data;

    const scenario = await db.scenario.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(worldDescription !== undefined && { worldDescription }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json(scenario);
  } catch (error) {
    console.error("Failed to update scenario:", error);
    return NextResponse.json(
      { error: "Failed to update scenario" },
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
    await db.scenario.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete scenario:", error);
    return NextResponse.json(
      { error: "Failed to delete scenario" },
      { status: 500 }
    );
  }
}
