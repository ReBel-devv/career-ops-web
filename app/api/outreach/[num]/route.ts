import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { addOutreachContactBodySchema } from "@/lib/domain";
import { parseAppNum, readOnlyGuard } from "@/lib/api/follow-up-error";
import { outreachErrorResponse } from "@/lib/api/outreach-error";

// Living data — never cache.
export const dynamic = "force-dynamic";

/**
 * GET /api/outreach/[num] — contacts for one application (empty list when none).
 */
export async function GET(
  _request: Request,
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
  try {
    const records = await getDataSource().getOutreach();
    const record = records.find((r) => r.appNum === num);
    return NextResponse.json({ appNum: num, contacts: record?.contacts ?? [] });
  } catch (error: unknown) {
    return outreachErrorResponse(error);
  }
}

/**
 * POST /api/outreach/[num] — add a contact.
 * Body: `{ kind, name, linkedin?, companyRole?, stage?, date?, notes? }`.
 * `stage` defaults to `identified`; `date` stamps that stage (defaults to today).
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
  const body = addOutreachContactBodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: body.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await getDataSource().addOutreachContact({
      appNum: num,
      ...body.data,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    return outreachErrorResponse(error);
  }
}
