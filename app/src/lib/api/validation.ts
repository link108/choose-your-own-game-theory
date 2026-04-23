import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";

export function validationErrorResponse(error: ZodError) {
  return NextResponse.json(
    {
      error: "Invalid request body",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400 }
  );
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>
): Promise<
  | { success: true; data: T }
  | { success: false; response: NextResponse }
> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 }
      ),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false,
      response: validationErrorResponse(parsed.error),
    };
  }

  return { success: true, data: parsed.data };
}

export async function parseOptionalJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  fallback: T
): Promise<
  | { success: true; data: T }
  | { success: false; response: NextResponse }
> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { success: true, data: fallback };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false,
      response: validationErrorResponse(parsed.error),
    };
  }

  return { success: true, data: parsed.data };
}
