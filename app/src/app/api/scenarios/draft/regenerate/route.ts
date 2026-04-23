import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api/validation";
import { regenerateScenarioDraftSectionSchema } from "@/lib/api/schemas";
import { regenerateScenarioBuilderSection } from "@/lib/scenario-builder";

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(
      request,
      regenerateScenarioDraftSectionSchema
    );
    if (!parsed.success) return parsed.response;

    const result = await regenerateScenarioBuilderSection({
      authorPrompt: parsed.data.prompt,
      draft: parsed.data.draft,
      section: parsed.data.section,
      refinementPrompt: parsed.data.refinementPrompt,
      answers: parsed.data.answers,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to regenerate scenario draft section:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to regenerate scenario draft section",
      },
      { status: 500 }
    );
  }
}
