import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await db.gameSession.findUnique({
      where: { id },
      select: { state: true, turn: true, status: true },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error("Failed to fetch session state:", error);
    return NextResponse.json(
      { error: "Failed to fetch session state" },
      { status: 500 }
    );
  }
}
