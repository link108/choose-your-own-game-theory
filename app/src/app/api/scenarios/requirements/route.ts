import { NextResponse } from "next/server";
import { analyzeScenarioRequirementsSchema } from "@/lib/api/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import { analyzeScenarioBuilderRequirements } from "@/lib/scenario-builder";

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, analyzeScenarioRequirementsSchema);
    if (!parsed.success) return parsed.response;

    const result = await analyzeScenarioBuilderRequirements(parsed.data.prompt);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to analyze scenario requirements:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze scenario requirements",
      },
      { status: 500 }
    );
  }
}
