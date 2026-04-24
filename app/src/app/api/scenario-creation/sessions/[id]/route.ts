import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeScenarioCreationSession } from "@/lib/scenario-creation/persistence";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await db.scenarioCreationSession.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        optionGroups: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Scenario creation session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(serializeScenarioCreationSession(session));
  } catch (error) {
    console.error("Failed to fetch scenario creation session:", error);
    return NextResponse.json(
      { error: "Failed to fetch scenario creation session" },
      { status: 500 }
    );
  }
}
