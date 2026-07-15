import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/documents — every generated CV + cover letter (the library). */
export async function GET(): Promise<NextResponse> {
  try {
    const documents = await getDataSource().getGeneratedDocuments();
    return NextResponse.json({ documents });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
