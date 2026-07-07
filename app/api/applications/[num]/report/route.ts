import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/applications/[num]/report — parsed report, 404 when none. */
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
    const report = await getDataSource().getReport(num);
    if (!report) {
      return NextResponse.json({ error: `No report for #${num}` }, { status: 404 });
    }
    return NextResponse.json({ report });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
