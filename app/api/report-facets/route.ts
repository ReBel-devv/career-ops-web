import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/report-facets — per-report archetype / vendor / location for filters. */
export async function GET(): Promise<NextResponse> {
  try {
    const facets = await getDataSource().getReportFacets();
    return NextResponse.json({ facets });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
