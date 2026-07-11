import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { addManualOfferInputSchema } from "@/lib/domain";
import { readOnlyGuard } from "@/lib/api/follow-up-error";
import { pipelineErrorResponse } from "@/lib/api/pipeline-error";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/pipeline — Discovery inbox (pending + processed). */
export async function GET(): Promise<NextResponse> {
  try {
    const items = await getDataSource().getPipelineItems();
    return NextResponse.json({ items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/pipeline — add a MANUAL `[!]` offer whose JD can't be auto-fetched.
 * Body: `{ url, jd }`. Saves the JD to `jds/` and appends a pending line;
 * queue-only (the CLI `pipeline` mode evaluates it). Returns the created item.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = readOnlyGuard();
  if (guard) return guard;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = addManualOfferInputSchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid request body", issues: body.error.issues },
      { status: 400 },
    );
  }

  try {
    const item = await getDataSource().addManualOffer(body.data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error: unknown) {
    return pipelineErrorResponse(error);
  }
}
