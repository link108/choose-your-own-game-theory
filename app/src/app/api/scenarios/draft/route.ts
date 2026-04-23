import { NextResponse } from "next/server";
import { generateScenarioDraftWithAnswersSchema } from "@/lib/api/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import { generateScenarioBuilderDraft } from "@/lib/scenario-builder";

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(
      request,
      generateScenarioDraftWithAnswersSchema
    );
    if (!parsed.success) return parsed.response;

    const result = await generateScenarioBuilderDraft(
      parsed.data.prompt,
      parsed.data.answers
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to generate scenario draft:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate scenario draft",
      },
      { status: 500 }
    );
  }
}
