import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api/validation";
import { validateScenarioDraftSchema } from "@/lib/api/schemas";
import { buildScenarioBuilderDraftResult } from "@/lib/scenario-builder";

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, validateScenarioDraftSchema);
    if (!parsed.success) return parsed.response;

    const result = buildScenarioBuilderDraftResult(parsed.data.draft);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to validate scenario draft:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to validate scenario draft",
      },
      { status: 500 }
    );
  }
}
