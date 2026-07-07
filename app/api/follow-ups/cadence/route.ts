import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/follow-ups/cadence — followup-cadence.mjs --json (never recomputed). */
export async function GET(): Promise<NextResponse> {
  try {
    const cadence = await getDataSource().getFollowUpCadence();
    return NextResponse.json({ cadence });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
