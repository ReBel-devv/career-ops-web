"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConversationSummary } from "./types";

export const conversationsKey = ["assistant-conversations"] as const;

async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await fetch("/api/assistant/conversations", {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const json = (await res.json()) as { conversations: ConversationSummary[] };
  return json.conversations;
}

/**
 * History index for the assistant: the list of stored conversations plus rename
 * and delete actions. Persistence of the *current* conversation is owned by
 * `useAssistantChat`; this hook only reads the index and mutates titles/removal,
 * invalidating the list so every surface stays in sync.
 */
export function useConversations() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: conversationsKey,
    queryFn: fetchConversations,
    staleTime: 5_000,
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: conversationsKey });

  const rename = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await fetch(`/api/assistant/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`Rename failed (${res.status})`);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`Delete failed (${res.status})`);
    },
    onSuccess: invalidate,
  });

  return {
    conversations: query.data ?? [],
    isLoading: query.isLoading,
    rename: (id: string, title: string) => rename.mutate({ id, title }),
    remove: (id: string) => remove.mutate(id),
    refetch: invalidate,
  };
}
