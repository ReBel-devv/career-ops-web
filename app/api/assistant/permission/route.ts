/**
 * POST /api/assistant/permission — resolves a pending tool-permission request.
 *
 * The chat route's `canUseTool` awaits an in-memory decision keyed by the SDK
 * `requestId`; this endpoint is how the UI's Approve/Deny card delivers it
 * (ASSISTANT-PLAN §6). Local-only, same gate as the chat route.
 */
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { resolvePermission } from "@/lib/assistant/permission-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const permissionRequestSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approve", "deny"]),
  scope: z.enum(["once", "conversation"]).default("once"),
});

export async function POST(request: Request): Promise<Response> {
  const config = getConfig();
  if (!config.assistantEnabled || !config.careerOpsPath) {
    return Response.json({ error: "The assistant is disabled." }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = permissionRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const { requestId, decision, scope } = parsed.data;
  const resolved = resolvePermission(requestId, { decision, scope });
  if (!resolved) {
    // Unknown / already-answered / expired (e.g. the turn was aborted).
    return Response.json(
      { error: "No pending permission request for that id." },
      { status: 404 },
    );
  }

  return Response.json({ ok: true });
}
