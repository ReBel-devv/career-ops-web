import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/scan-history — portal scanner dedup history, READ-ONLY. */
export async function GET(): Promise<NextResponse> {
  try {
    const records = await getDataSource().getScanHistory();
    return NextResponse.json({ records });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
