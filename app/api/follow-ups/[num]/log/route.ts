import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { logFollowUpBodySchema } from "@/lib/domain";
import {
  followUpErrorResponse,
  parseAppNum,
  readOnlyGuard,
} from "@/lib/api/follow-up-error";

// Living data — never cache.
export const dynamic = "force-dynamic";

/**
 * POST /api/follow-ups/[num]/log — body `{ date?, channel?, contact?, notes? }`.
 * Appends ONE table row to data/follow-ups.md recording a follow-up was sent
 * (never edits existing lines; re-parse gated).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ num: string }> },
): Promise<NextResponse> {
  const { num: numRaw } = await context.params;
  const num = parseAppNum(numRaw);
  if (num === null) {
    return NextResponse.json(
      { error: `Invalid application number: ${numRaw}` },
      { status: 400 },
    );
  }

  const guard = readOnlyGuard();
  if (guard) return guard;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = logFollowUpBodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: body.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await getDataSource().logFollowUp({ num, ...body.data });
    return NextResponse.json(result);
  } catch (error: unknown) {
    return followUpErrorResponse(error);
  }
}
