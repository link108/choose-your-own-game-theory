import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createScenarioFromDraftSchema } from "@/lib/api/schemas";
import { parseJsonBody } from "@/lib/api/validation";
import {
  createScenarioFromBuilderDraft,
  validateScenarioBuilderDraft,
} from "@/lib/scenario-builder";

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, createScenarioFromDraftSchema);
    if (!parsed.success) return parsed.response;

    const validation = validateScenarioBuilderDraft(parsed.data.draft);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "Scenario draft is not valid",
          issues: validation.issues,
          diagnostics: validation.diagnostics,
        },
        { status: 400 }
      );
    }

    const scenario = await createScenarioFromBuilderDraft(db, parsed.data.draft);
    return NextResponse.json(scenario, { status: 201 });
  } catch (error) {
    console.error("Failed to create scenario from draft:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create scenario from draft",
      },
      { status: 500 }
    );
  }
}
