import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const variables = await db.worldVariable.findMany({
      where: { scenarioId: id },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(variables);
  } catch (error) {
    console.error("Failed to fetch world variables:", error);
    return NextResponse.json(
      { error: "Failed to fetch world variables" },
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
    const body = await request.json();
    const { name, value, kind, minValue, maxValue, config } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Variable name is required" },
        { status: 400 }
      );
    }

    const variable = await db.worldVariable.create({
      data: {
        scenarioId: id,
        name,
        value: value ?? "",
        kind: kind ?? "text",
        minValue: minValue ?? null,
        maxValue: maxValue ?? null,
        config: config ?? null,
      },
    });

    return NextResponse.json(variable, { status: 201 });
  } catch (error) {
    console.error("Failed to create world variable:", error);
    return NextResponse.json(
      { error: "Failed to create world variable" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const body = await request.json();
    const { variableId, name, value, kind, minValue, maxValue, config } = body;

    if (!variableId) {
      return NextResponse.json(
        { error: "Variable ID is required" },
        { status: 400 }
      );
    }

    const variable = await db.worldVariable.update({
      where: { id: variableId },
      data: {
        ...(name !== undefined && { name }),
        ...(value !== undefined && { value }),
        ...(kind !== undefined && { kind }),
        ...(minValue !== undefined && { minValue }),
        ...(maxValue !== undefined && { maxValue }),
        ...(config !== undefined && { config }),
      },
    });

    return NextResponse.json(variable);
  } catch (error) {
    console.error("Failed to update world variable:", error);
    return NextResponse.json(
      { error: "Failed to update world variable" },
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
    const variableId = searchParams.get("variableId");

    if (!variableId) {
      return NextResponse.json(
        { error: "Variable ID is required" },
        { status: 400 }
      );
    }

    await db.worldVariable.delete({ where: { id: variableId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete world variable:", error);
    return NextResponse.json(
      { error: "Failed to delete world variable" },
      { status: 500 }
    );
  }
}
