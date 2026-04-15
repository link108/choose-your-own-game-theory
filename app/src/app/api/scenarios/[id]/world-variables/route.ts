import { db } from "@/lib/db";
import {
  createWorldVariableSchema,
  updateWorldVariableSchema,
} from "@/lib/api/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";

function toPrismaJsonConfig(config?: { step?: number } | null) {
  if (config === undefined || config === null) return Prisma.JsonNull;
  return config.step === undefined ? {} : { step: config.step };
}

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
    const parsed = await parseJsonBody(request, createWorldVariableSchema);
    if (!parsed.success) return parsed.response;
    const { name, value, kind, minValue, maxValue, config } = parsed.data;

    const variable = await db.worldVariable.create({
      data: {
        scenarioId: id,
        name,
        value: value ?? "",
        kind: kind ?? "text",
        minValue: minValue ?? null,
        maxValue: maxValue ?? null,
        config: toPrismaJsonConfig(config),
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
    const parsed = await parseJsonBody(request, updateWorldVariableSchema);
    if (!parsed.success) return parsed.response;
    const { variableId, name, value, kind, minValue, maxValue, config } =
      parsed.data;

    const variable = await db.worldVariable.update({
      where: { id: variableId },
      data: {
        ...(name !== undefined && { name }),
        ...(value !== undefined && { value }),
        ...(kind !== undefined && { kind }),
        ...(minValue !== undefined && { minValue }),
        ...(maxValue !== undefined && { maxValue }),
        ...(config !== undefined && { config: toPrismaJsonConfig(config) }),
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
