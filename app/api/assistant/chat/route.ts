/**
 * POST /api/assistant/chat — streams an assistant turn as Server-Sent Events.
 *
 * Local-only: 403 unless `assistantEnabled` (see lib/config). Runs the Claude
 * Agent SDK in-process against the career-ops data repo. Phase 2 is read-only.
 */
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { EFFORT_LEVELS } from "@/lib/assistant/config";
import { runAssistant } from "@/lib/assistant/runner";
import { sseStream, SSE_HEADERS } from "@/lib/assistant/sse";
import type { AssistantEffort } from "@/lib/assistant/types";

// The SDK reads the disk, spawns a subprocess, and streams — Node runtime only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chatRequestSchema = z.object({
  message: z.string().trim().min(1, "message is required").max(20_000),
  conversationId: z.string().optional(),
  mode: z.enum(["confirmation", "autonomous"]).optional(),
  resume: z.string().optional(),
  model: z.string().optional(),
  effort: z.enum(EFFORT_LEVELS as [string, ...string[]]).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const config = getConfig();
  if (!config.assistantEnabled || !config.careerOpsPath) {
    return Response.json(
      { error: "The assistant is disabled (local-only; requires CAREER_OPS_PATH and no DEMO_MODE)." },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  // Abort the turn when the client disconnects (or the Stop button aborts fetch).
  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => abortController.abort());

  const events = runAssistant({
    message: parsed.data.message,
    cwd: config.careerOpsPath,
    // Mutating tools are only exposed when the install is writable (not READ_ONLY).
    writable: config.assistantWritable,
    // Confirmation (default) gates every mutation behind a card; autonomous
    // auto-approves within the hard guardrails (which stay enforced via the
    // PreToolUse hook regardless of mode). Read-only installs ignore this.
    mode: parsed.data.mode === "autonomous" ? "autonomous" : "confirmation",
    model: parsed.data.model,
    effort: parsed.data.effort as AssistantEffort | undefined,
    resume: parsed.data.resume,
    abortController,
  });

  return new Response(sseStream(events), { headers: SSE_HEADERS });
}
