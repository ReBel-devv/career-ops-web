import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/follow-ups — logged follow-ups + pins (read-only in M3). */
export async function GET(): Promise<NextResponse> {
  try {
    const data = await getDataSource().getFollowUps();
    return NextResponse.json({ data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
