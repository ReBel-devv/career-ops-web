import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — states.yml is read at request time.
export const dynamic = "force-dynamic";

/** GET /api/states — canonical states from states.yml, in declared order. */
export async function GET(): Promise<NextResponse> {
  try {
    const states = await getDataSource().getStates();
    return NextResponse.json({ states });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
