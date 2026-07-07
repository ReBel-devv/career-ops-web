import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { rescheduleFollowUpBodySchema } from "@/lib/domain";
import {
  followUpErrorResponse,
  parseAppNum,
  readOnlyGuard,
} from "@/lib/api/follow-up-error";

// Living data — never cache.
export const dynamic = "force-dynamic";

/**
 * POST /api/follow-ups/[num]/reschedule — body `{ date }`.
 * Appends a pin so the next follow-up lands on `date` (followup-seed --force,
 * append-only, never edits existing lines).
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
  const body = rescheduleFollowUpBodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: body.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await getDataSource().rescheduleFollowUp({
      num,
      date: body.data.date,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    return followUpErrorResponse(error);
  }
}
