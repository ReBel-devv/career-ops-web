import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/applications — zod-validated tracker rows as JSON. */
export async function GET(): Promise<NextResponse> {
  try {
    const applications = await getDataSource().getApplications();
    return NextResponse.json({ applications });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
