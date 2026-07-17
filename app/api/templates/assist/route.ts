import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getDataSource } from "@/lib/data";
import { templateAssistBodySchema } from "@/lib/domain";
import { rejectCrossOrigin } from "@/lib/assistant/origin-guard";
import {
  runTemplateAssist,
  TemplateAssistError,
} from "@/lib/assistant/template-assist";

// The SDK spawns a subprocess — Node runtime, never cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/templates/assist — propose a template (generation) or a revision
 * of an existing one. READ-ONLY: the proposal returns to the client as a diff
 * the user approves; the approved save goes through POST/PATCH /api/templates.
 * Local-only, like the assistant (requires CAREER_OPS_PATH, no DEMO_MODE).
 */
export async function POST(request: Request): Promise<Response> {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const config = getConfig();
  if (!config.assistantEnabled || !config.careerOpsPath) {
    return NextResponse.json(
      {
        error:
          "Template generation is disabled (local-only; requires CAREER_OPS_PATH and no DEMO_MODE).",
      },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = templateAssistBodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => abortController.abort());

  try {
    const profile = await getDataSource().getProfile();
    const proposal = await runTemplateAssist({
      prompt: body.data.prompt,
      current: body.data.current,
      profile,
      cwd: config.careerOpsPath,
      abortController,
    });
    return NextResponse.json({ proposal });
  } catch (error: unknown) {
    if (error instanceof TemplateAssistError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
