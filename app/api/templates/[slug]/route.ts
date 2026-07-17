import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getDataSource } from "@/lib/data";
import { saveTemplateBodySchema } from "@/lib/domain";
import {
  isValidTemplateSlug,
  TemplateWriteError,
  type TemplateWriteErrorCode,
} from "@/lib/writers";

// Living data — never cache.
export const dynamic = "force-dynamic";

const TEMPLATE_ERROR_STATUS: Record<TemplateWriteErrorCode, number> = {
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  STALE_TEMPLATE: 409,
  READ_ONLY: 403,
  LOCK_TIMEOUT: 503,
  PARSE_FAILED: 500,
};

/** GET /api/templates/[slug] — current template + version history. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await context.params;
  if (!isValidTemplateSlug(slug)) {
    return NextResponse.json({ error: `Invalid template slug: ${slug}` }, { status: 400 });
  }
  try {
    const detail = await getDataSource().getTemplate(slug);
    if (!detail) {
      return NextResponse.json({ error: `Template "${slug}" not found.` }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/templates/[slug] — save a new version (manual edit, approved
 * agent revision, or a restore). Optimistic concurrency via `expectedSavedAt`.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await context.params;
  if (!isValidTemplateSlug(slug)) {
    return NextResponse.json({ error: `Invalid template slug: ${slug}` }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = saveTemplateBodySchema.safeParse(json);
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
    const detail = await getDataSource().saveTemplate({ ...body.data, slug });
    return NextResponse.json(detail);
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
