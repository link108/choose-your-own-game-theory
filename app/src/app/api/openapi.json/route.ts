import { createOpenApiDocument } from "@/lib/api/openapi";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(createOpenApiDocument());
}
