import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/applications/[num]/documents — CV + cover letters for an app. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ num: string }> },
): Promise<NextResponse> {
  const { num: numRaw } = await context.params;
  const num = Number.parseInt(numRaw, 10);
  if (!Number.isInteger(num) || num <= 0) {
    return NextResponse.json({ error: `Invalid application number: ${numRaw}` }, { status: 400 });
  }
  try {
    const documents = await getDataSource().getDocuments(num);
    return NextResponse.json({ documents });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
