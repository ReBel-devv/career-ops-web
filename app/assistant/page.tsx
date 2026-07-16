import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getConfig } from "@/lib/config";
import { AssistantPage } from "@/components/assistant/assistant-page";

export const metadata: Metadata = {
  title: "Assistant",
};

// Reads config at request time; the assistant is local-only.
export const dynamic = "force-dynamic";

/** `/assistant` — full-screen assistant. 404 when the assistant is disabled. */
export default function Page() {
  if (!getConfig().assistantEnabled) notFound();
  return <AssistantPage />;
}
