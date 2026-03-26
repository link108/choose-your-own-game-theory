import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const scenarios = await db.scenario.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { actors: true, sessions: true } },
      },
    });
    return NextResponse.json(scenarios);
  } catch (error) {
    console.error("Failed to fetch scenarios:", error);
    return NextResponse.json(
      { error: "Failed to fetch scenarios" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, worldDescription } = body;

    if (!name || !description) {
      return NextResponse.json(
        { error: "Name and description are required" },
        { status: 400 }
      );
    }

    const scenario = await db.scenario.create({
      data: {
        name,
        description,
        worldDescription: worldDescription ?? "",
      },
    });

    return NextResponse.json(scenario, { status: 201 });
  } catch (error) {
    console.error("Failed to create scenario:", error);
    return NextResponse.json(
      { error: "Failed to create scenario" },
      { status: 500 }
    );
  }
}
