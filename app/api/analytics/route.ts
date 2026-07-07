import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — never cache (the script re-reads the tracker in ~40 ms).
export const dynamic = "force-dynamic";

/** GET /api/analytics — analyze-patterns.mjs --json (never recomputed).
 * `result.kind` is "ok" or "insufficient" (young tracker — still a 200). */
export async function GET(): Promise<NextResponse> {
  try {
    const result = await getDataSource().getPatterns();
    return NextResponse.json({ result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
