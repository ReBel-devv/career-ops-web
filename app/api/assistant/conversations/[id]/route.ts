/**
 * Per-conversation CRUD for the assistant history (ASSISTANT-PLAN §5, Phase 6).
 *
 *   GET    — full conversation (404 if unknown)
 *   PUT    — create/overwrite the whole conversation (client-owned view)
 *   PATCH  — rename ({ title })
 *   DELETE — remove
 *
 * Local-only, same gate as the chat route. The `id` in the body must match the
 * route id; the store validates ids against a strict charset (no traversal).
 */
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { rejectCrossOrigin } from "@/lib/assistant/origin-guard";
import {
  CONVERSATION_ID_RE,
  deleteConversation,
  readConversation,
  renameConversation,
  saveConversation,
  storedConversationSchema,
} from "@/lib/assistant/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guard(request: Request): Response | null {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  const config = getConfig();
  if (!config.assistantEnabled || !config.careerOpsPath) {
    return Response.json({ error: "The assistant is disabled." }, { status: 403 });
  }
  return null;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const conversation = readConversation(id);
  if (!conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  return Response.json({ conversation });
}

export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!CONVERSATION_ID_RE.test(id)) {
    return Response.json({ error: "Invalid conversation id." }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = storedConversationSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid conversation" },
      { status: 400 },
    );
  }
  if (parsed.data.id !== id) {
    return Response.json({ error: "Body id does not match the route id." }, { status: 400 });
  }

  const conversation = saveConversation(parsed.data);
  return Response.json({ conversation });
}

const renameSchema = z.object({ title: z.string().trim().min(1).max(300) });

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = renameSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid rename" },
      { status: 400 },
    );
  }

  const entry = renameConversation(id, parsed.data.title);
  if (!entry) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  return Response.json({ conversation: entry });
}

export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  const denied = guard(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const existed = deleteConversation(id);
  if (!existed) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
