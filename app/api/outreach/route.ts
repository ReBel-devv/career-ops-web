import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/outreach — all outreach contacts, grouped per application. */
export async function GET(): Promise<NextResponse> {
  try {
    const records = await getDataSource().getOutreach();
    return NextResponse.json({ records });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
