import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getDataSource } from "@/lib/data";
import { updateApplicationBodySchema } from "@/lib/domain";
import { TrackerWriteError, type TrackerWriteErrorCode } from "@/lib/writers";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** TrackerWriteError code → HTTP status (plan §4.1 / Decision 7). */
const ERROR_STATUS: Record<TrackerWriteErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_STATUS: 400,
  NOT_FOUND: 404,
  STALE_ROW: 409,
  READ_ONLY: 403,
  LOCK_TIMEOUT: 503,
  VERIFY_FAILED: 500,
};

/**
 * PATCH /api/applications/[num] — write ONE tracker cell (Status or Notes).
 * Body: `{ status?, notes?, expected: { company, role } }`.
 * Any canonical status transition is allowed (Decision 5).
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ num: string }> },
): Promise<NextResponse> {
  const { num: numRaw } = await context.params;
  const num = Number.parseInt(numRaw, 10);
  if (!Number.isInteger(num) || num <= 0 || String(num) !== numRaw.trim()) {
    return NextResponse.json(
      { error: `Invalid application number: ${numRaw}` },
      { status: 400 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = updateApplicationBodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: body.error.issues },
      { status: 400 },
    );
  }

  // Belt-and-suspenders (Decision 7): READ_ONLY disables all real-fs
  // mutations at the route edge too. Demo writes are in-memory and allowed.
  const config = getConfig();
  if (config.readOnly && !config.demoMode) {
    return NextResponse.json(
      { error: "READ_ONLY is set — all mutations are disabled." },
      { status: 403 },
    );
  }

  try {
    const result = await getDataSource().updateApplication({
      num,
      expected: body.data.expected,
      status: body.data.status,
      notes: body.data.notes,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof TrackerWriteError) {
      return NextResponse.json(
        { error: error.message, code: error.code, detail: error.detail },
        { status: ERROR_STATUS[error.code] },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
