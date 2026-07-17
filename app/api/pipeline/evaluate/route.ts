import { NextResponse } from "next/server";
import { z } from "zod";
import { getConfig, requireCareerOpsPath } from "@/lib/config";
import { getDataSource } from "@/lib/data";
import { readOnlyGuard } from "@/lib/api/follow-up-error";
import {
  getEvaluationState,
  startEvaluationJob,
  type EvaluateTarget,
} from "@/lib/evaluate/runner";

// Living data — never cache.
export const dynamic = "force-dynamic";

/**
 * POST /api/pipeline/evaluate — evaluate pending Discovery-inbox offers with
 * the repo's headless worker contract (see lib/evaluate/runner.ts). Body is
 * either `{ url }` (one offer) or `{ count }` (the next N pending). Responds
 * 202 immediately; the job runs detached and GET exposes its progress.
 *
 * Evaluations are real LLM runs (same auth as the embedded assistant), so the
 * endpoint shares the assistant's availability gate on top of READ_ONLY/demo.
 */

const bodySchema = z.union([
  z.object({ url: z.string().min(1) }),
  z.object({ count: z.number().int().min(1).max(25) }),
]);

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ job: getEvaluationState() });
}

export async function POST(request: Request): Promise<NextResponse> {
  const guard = readOnlyGuard();
  if (guard) return guard;
  const config = getConfig();
  if (config.demoMode) {
    return NextResponse.json(
      {
        error:
          "Evaluation is unavailable in demo mode — it needs a local data repo.",
      },
      { status: 403 },
    );
  }
  if (!config.assistantEnabled) {
    return NextResponse.json(
      {
        error:
          "Evaluation needs the local agent (ASSISTANT_ENABLED) — it runs Claude.",
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
  const body = bodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  if (getEvaluationState().running) {
    return NextResponse.json(
      { error: "An evaluation job is already running." },
      { status: 409 },
    );
  }

  // Resolve requested offers against the actual Pending inbox — the server
  // decides what is evaluatable (pending + has a URL), never the client.
  const items = await getDataSource().getPipelineItems();
  const pending = items.filter(
    (i) => i.section === "pending" && i.url !== null,
  );

  let targets: EvaluateTarget[];
  if ("url" in body.data) {
    const requestedUrl = body.data.url;
    const item = pending.find((i) => i.url === requestedUrl);
    if (!item) {
      return NextResponse.json(
        { error: "This URL is not in the Pending inbox (already processed?)." },
        { status: 404 },
      );
    }
    targets = [{ url: item.url as string, localJd: item.localJd }];
  } else {
    targets = pending
      .slice(0, body.data.count)
      .map((i) => ({ url: i.url as string, localJd: i.localJd }));
    if (targets.length === 0) {
      return NextResponse.json(
        { error: "The Pending inbox has no evaluatable entries." },
        { status: 404 },
      );
    }
  }

  const repoPath = requireCareerOpsPath();
  if (!startEvaluationJob(repoPath, targets)) {
    return NextResponse.json(
      { error: "An evaluation job is already running." },
      { status: 409 },
    );
  }
  return NextResponse.json({ queued: targets.length }, { status: 202 });
}
