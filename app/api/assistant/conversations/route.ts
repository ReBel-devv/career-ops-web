/**
 * GET /api/assistant/conversations — list stored conversations (index only).
 * Local-only, same gate as the rest of the assistant surface.
 */
import { getConfig } from "@/lib/config";
import { listConversations } from "@/lib/assistant/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const config = getConfig();
  if (!config.assistantEnabled || !config.careerOpsPath) {
    return Response.json({ error: "The assistant is disabled." }, { status: 403 });
  }
  return Response.json({ conversations: listConversations() });
}
