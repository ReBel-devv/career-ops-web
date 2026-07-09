import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { updateOutreachContactBodySchema } from "@/lib/domain";
import { parseAppNum, readOnlyGuard } from "@/lib/api/follow-up-error";
import { outreachErrorResponse } from "@/lib/api/outreach-error";

// Living data — never cache.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ num: string; contactId: string }> };

async function parseSegments(
  context: Params,
): Promise<{ num: number; contactId: string } | NextResponse> {
  const { num: numRaw, contactId } = await context.params;
  const num = parseAppNum(numRaw);
  if (num === null) {
    return NextResponse.json(
      { error: `Invalid application number: ${numRaw}` },
      { status: 400 },
    );
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(contactId)) {
    return NextResponse.json(
      { error: `Invalid contact id: ${contactId}` },
      { status: 400 },
    );
  }
  return { num, contactId };
}

/**
 * PATCH /api/outreach/[num]/[contactId] — edit a contact and/or set its stage.
 * Body: `{ kind?, name?, linkedin?, companyRole?, notes?, stage?, date? }`.
 * When `stage` is present it becomes current and its date is stamped
 * (defaults to today). Stage moves are unrestricted — forward, skipping, and
 * regressions are all allowed (Decision 5 spirit).
 */
export async function PATCH(
  request: Request,
  context: Params,
): Promise<NextResponse> {
  const seg = await parseSegments(context);
  if (seg instanceof NextResponse) return seg;

  const guard = readOnlyGuard();
  if (guard) return guard;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = updateOutreachContactBodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: body.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await getDataSource().updateOutreachContact({
      appNum: seg.num,
      contactId: seg.contactId,
      ...body.data,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    return outreachErrorResponse(error);
  }
}

/** DELETE /api/outreach/[num]/[contactId] — remove a contact. */
export async function DELETE(
  _request: Request,
  context: Params,
): Promise<NextResponse> {
  const seg = await parseSegments(context);
  if (seg instanceof NextResponse) return seg;

  const guard = readOnlyGuard();
  if (guard) return guard;

  try {
    const result = await getDataSource().deleteOutreachContact({
      appNum: seg.num,
      contactId: seg.contactId,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    return outreachErrorResponse(error);
  }
}
