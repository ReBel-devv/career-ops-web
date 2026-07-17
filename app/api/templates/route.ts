import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getDataSource } from "@/lib/data";
import { createTemplateBodySchema } from "@/lib/domain";
import { TemplateWriteError, type TemplateWriteErrorCode } from "@/lib/writers";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** TemplateWriteError code → HTTP status (mirrors the other write routes). */
const TEMPLATE_ERROR_STATUS: Record<TemplateWriteErrorCode, number> = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  STALE_TEMPLATE: 409,
  READ_ONLY: 403,
  LOCK_TIMEOUT: 503,
  PARSE_FAILED: 500,
};

/** GET /api/templates — every template's current version, newest first. */
export async function GET(): Promise<NextResponse> {
  try {
    const templates = await getDataSource().getTemplates();
    return NextResponse.json({ templates });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/templates — create a template (blank or an approved generation). */
export async function POST(request: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = createTemplateBodySchema.safeParse(json);
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
    const detail = await getDataSource().createTemplate(body.data);
    return NextResponse.json(detail, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof TemplateWriteError) {
      return NextResponse.json(
        { error: error.message, code: error.code, detail: error.detail },
        { status: TEMPLATE_ERROR_STATUS[error.code] },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
