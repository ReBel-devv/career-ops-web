"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { AssistantEvent, AssistantMode } from "@/lib/assistant/types";
import { invalidationKeysForPath } from "./invalidation";
import { conversationsKey } from "./use-conversations";
import { useAssistantSettings } from "./use-assistant-settings";
import type { AssistantBlock, ChatMessage, ChatStatus } from "./types";

let counter = 0;
const uid = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${counter++}`;

/** Derive a conversation title from the first user message. */
function deriveTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine || "New conversation";
}

/**
 * Bring a stored message up to the ordered-block model. Conversations saved
 * before blocks existed carry a flat `content` string + a `logs` array; we
 * synthesize blocks from them (tools first, then the text — matching how the
 * old UI stacked them) so history keeps rendering.
 */
function normalizeLoaded(m: ChatMessage & { logs?: ActionLogEntryLike[] }): ChatMessage {
  const base = { ...m, streaming: false };
  if (Array.isArray(m.blocks) && m.blocks.length > 0) return base;
  if (m.role === "user") return { ...base, blocks: [] };
  const blocks: AssistantBlock[] = [];
  let seq = 0;
  for (const log of m.logs ?? []) {
    blocks.push({ kind: "tool", seq: seq++, ...log });
  }
  if (m.content) blocks.push({ kind: "text", seq: seq++, text: m.content, done: true });
  return { ...base, content: "", blocks };
}

/** Shape of a legacy stored tool-log entry (pre-blocks conversations). */
type ActionLogEntryLike = {
  id: string;
  name: string;
  input?: unknown;
  ok?: boolean;
  summary?: string;
};

/** A user's answer to a permission card. */
export type PermissionDecision = "approve" | "deny";
export type PermissionScope = "once" | "conversation";

/** Mutate the assistant message with the given id. */
type Patch = (fn: (message: ChatMessage) => ChatMessage) => void;

/** Extra context applyEvent needs for tool-path tracking + cache invalidation. */
interface ApplyContext {
  sessionIdRef: React.MutableRefObject<string | undefined>;
  /** tool_use id → written file path, so we can invalidate on its result. */
  toolPaths: Map<string, string>;
  qc: QueryClient;
}

/** Insert a block in `seq` order (or return the list unchanged if it exists). */
function insertBlock(blocks: AssistantBlock[], block: AssistantBlock): AssistantBlock[] {
  if (blocks.some((b) => b.seq === block.seq)) return blocks;
  const next = [...blocks, block];
  next.sort((a, b) => a.seq - b.seq);
  return next;
}

/**
 * Append streamed text to the text/thinking block at `seq`, creating it if the
 * `block_start` event was missed (deltas are self-sufficient).
 */
function appendToBlock(
  blocks: AssistantBlock[],
  seq: number,
  kind: "text" | "thinking",
  text: string,
): AssistantBlock[] {
  if (!blocks.some((b) => b.seq === seq)) {
    return insertBlock(blocks, { kind, seq, text });
  }
  return blocks.map((b) =>
    b.seq === seq && (b.kind === "text" || b.kind === "thinking")
      ? { ...b, text: b.text + text }
      : b,
  );
}

/** Apply one decoded SSE event to the streaming assistant message. */
function applyEvent(event: AssistantEvent, patch: Patch, ctx: ApplyContext): void {
  switch (event.type) {
    case "session":
      ctx.sessionIdRef.current = event.sdkSessionId;
      break;
    case "block_start":
      patch((m) => ({
        ...m,
        blocks: insertBlock(m.blocks, { kind: event.blockType, seq: event.seq, text: "" }),
      }));
      break;
    case "text_delta":
      patch((m) => ({ ...m, blocks: appendToBlock(m.blocks, event.seq, "text", event.text) }));
      break;
    case "thinking_delta":
      patch((m) => ({
        ...m,
        blocks: appendToBlock(m.blocks, event.seq, "thinking", event.text),
      }));
      break;
    case "block_stop":
      patch((m) => ({
        ...m,
        blocks: m.blocks.map((b) => (b.seq === event.seq ? { ...b, done: true } : b)),
      }));
      break;
    case "tool_use": {
      const input = event.input as Record<string, unknown> | undefined;
      const filePath = input && typeof input.file_path === "string" ? input.file_path : undefined;
      if (filePath) ctx.toolPaths.set(event.id, filePath);
      // A tool is emitted several times as its input streams in (empty → partial
      // → full); upsert by seq so it appears immediately and refines in place,
      // without losing a result that may already have arrived.
      patch((m) => {
        const idx = m.blocks.findIndex((b) => b.kind === "tool" && b.seq === event.seq);
        if (idx === -1) {
          return {
            ...m,
            blocks: insertBlock(m.blocks, {
              kind: "tool",
              seq: event.seq,
              id: event.id,
              name: event.name,
              input: event.input,
            }),
          };
        }
        const blocks = m.blocks.slice();
        const prev = blocks[idx];
        if (prev.kind === "tool") {
          blocks[idx] = { ...prev, name: event.name, input: event.input };
        }
        return { ...m, blocks };
      });
      break;
    }
    case "tool_result":
      patch((m) => ({
        ...m,
        blocks: m.blocks.map((b) =>
          b.kind === "tool" && b.id === event.id
            ? { ...b, ok: event.ok, summary: event.summary }
            : b,
        ),
      }));
      if (event.ok) {
        const filePath = ctx.toolPaths.get(event.id);
        if (filePath) {
          for (const queryKey of invalidationKeysForPath(filePath)) {
            void ctx.qc.invalidateQueries({ queryKey });
          }
        }
      }
      ctx.toolPaths.delete(event.id);
      break;
    case "permission_request":
      patch((m) => ({
        ...m,
        permissions: [
          ...m.permissions,
          {
            requestId: event.requestId,
            name: event.name,
            preview: event.preview,
            title: event.title,
            status: "pending",
            seq: event.seq,
          },
        ],
      }));
      break;
    case "error":
      patch((m) => ({
        ...m,
        error: {
          message: event.message,
          limit: event.limit
            ? { kind: event.limit.kind, resetsAt: event.limit.resetsAt }
            : undefined,
        },
      }));
      break;
    case "done":
      // Any card still pending when the turn ends can no longer be answered.
      patch((m) => ({
        ...m,
        streaming: false,
        permissions: m.permissions.map((p) =>
          p.status === "pending" ? { ...p, status: "denied" } : p,
        ),
      }));
      break;
  }
}

/**
 * Streaming chat client for the assistant. Owns the message list and the fetch
 * to `POST /api/assistant/chat`, decoding the SSE stream into message updates.
 *
 * Multi-turn context is kept via the SDK session id: each turn is sent with
 * `resume` set to the last session, so the agent keeps prior context in-memory.
 * Mutating tool calls surface as permission cards answered via `respond`; an
 * approved write invalidates the affected dashboard queries. (Durable
 * persistence lands in Phase 6.)
 */
export function useAssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setModeState] = useState<AssistantMode>("confirmation");
  const modeRef = useRef<AssistantMode>("confirmation");
  const sessionIdRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const toolPathsRef = useRef<Map<string, string>>(new Map());
  // Persistence bookkeeping for the current conversation.
  const conversationIdRef = useRef<string | null>(null);
  const titleRef = useRef<string>("");
  const createdAtRef = useRef<number>(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  // True once a turn has run and the conversation needs saving — so loading an
  // existing conversation doesn't immediately re-save (and reorder history).
  const dirtyRef = useRef(false);
  const qc = useQueryClient();
  const settings = useAssistantSettings();
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // A fresh, untouched surface follows the user's default autonomy preference
  // (each conversation can still toggle it afterwards).
  useEffect(() => {
    if (!conversationIdRef.current && messagesRef.current.length === 0) {
      modeRef.current = settings.defaultMode;
      setModeState(settings.defaultMode);
    }
  }, [settings.defaultMode]);

  // Keep a ref of the latest messages so we can persist after a turn without a
  // stale closure.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  /** Persist the current conversation to disk (fire-and-forget), then refresh the index. */
  const persist = useCallback(async () => {
    const id = conversationIdRef.current;
    if (!id) return;
    const msgs = messagesRef.current
      // Drop an empty, error-free assistant placeholder (e.g. aborted before any output).
      .filter(
        (m) =>
          !(m.role === "assistant" && m.blocks.length === 0 && !m.error),
      )
      .map(({ streaming: _streaming, ...rest }) => rest);
    if (msgs.length === 0) return;
    const now = Date.now();
    const body = {
      id,
      title: titleRef.current || "New conversation",
      createdAt: createdAtRef.current || now,
      updatedAt: now,
      sdkSessionId: sessionIdRef.current,
      mode: modeRef.current,
      messages: msgs,
    };
    try {
      await fetch(`/api/assistant/conversations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      qc.invalidateQueries({ queryKey: conversationsKey });
    } catch {
      // Persistence is best-effort; a failed save doesn't break the live chat.
    }
  }, [qc]);

  // Save once a turn settles (status returns to idle). Guarded by `dirtyRef` so
  // mounting or loading a conversation never triggers a spurious re-save.
  useEffect(() => {
    if (status === "idle" && dirtyRef.current && conversationIdRef.current) {
      dirtyRef.current = false;
      void persist();
    }
  }, [status, persist]);

  /** Interrupt the in-flight turn (Stop button / client abort). */
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** Answer a permission card (approve/deny, once vs whole conversation). */
  const respond = useCallback(
    async (requestId: string, decision: PermissionDecision, scope: PermissionScope = "once") => {
      // Optimistically reflect the choice; the SSE stream keeps flowing.
      setMessages((list) =>
        list.map((m) => ({
          ...m,
          permissions: m.permissions.map((p) =>
            p.requestId === requestId && p.status === "pending"
              ? { ...p, status: decision === "approve" ? "approved" : "denied", scope }
              : p,
          ),
        })),
      );
      try {
        await fetch("/api/assistant/permission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, decision, scope }),
        });
      } catch {
        // If the POST fails the turn will time out / error on its own.
      }
    },
    [],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || abortRef.current) return;

      // First message of a fresh conversation → mint an id + a derived title.
      if (!conversationIdRef.current) {
        conversationIdRef.current = uid("c");
        createdAtRef.current = Date.now();
        titleRef.current = deriveTitle(trimmed);
        setActiveId(conversationIdRef.current);
      }
      dirtyRef.current = true;

      const assistantId = uid("a");
      setMessages((list) => [
        ...list,
        { id: uid("u"), role: "user", content: trimmed, blocks: [], permissions: [] },
        {
          id: assistantId,
          role: "assistant",
          content: "",
          blocks: [],
          permissions: [],
          streaming: true,
        },
      ]);
      setStatus("streaming");

      const patch: Patch = (fn) =>
        setMessages((list) => list.map((m) => (m.id === assistantId ? fn(m) : m)));
      const ctx: ApplyContext = { sessionIdRef, toolPaths: toolPathsRef.current, qc };

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            resume: sessionIdRef.current,
            mode: modeRef.current,
            model: settingsRef.current.model,
            effort: settingsRef.current.effort,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          let message = `Request failed (${res.status}).`;
          try {
            const body = await res.json();
            if (body?.error) message = String(body.error);
          } catch {
            // non-JSON error body — keep the generic message.
          }
          patch((m) => ({ ...m, streaming: false, error: { message } }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            const payload = dataLine.slice(5).trim();
            if (!payload) continue;
            try {
              applyEvent(JSON.parse(payload) as AssistantEvent, patch, ctx);
            } catch {
              // Ignore malformed frames.
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const message = err instanceof Error ? err.message : "Connection error.";
          patch((m) => ({ ...m, error: { message } }));
        }
      } finally {
        abortRef.current = null;
        // Clear any lingering streaming flag + un-answerable pending cards.
        patch((m) =>
          m.streaming
            ? {
                ...m,
                streaming: false,
                permissions: m.permissions.map((p) =>
                  p.status === "pending" ? { ...p, status: "denied" } : p,
                ),
              }
            : m,
        );
        if (mountedRef.current) setStatus("idle");
      }
    },
    [qc],
  );

  /** Set the autonomy mode for the current conversation (persisted immediately). */
  const setMode = useCallback((next: AssistantMode) => {
    modeRef.current = next;
    setModeState(next);
    // Save the new mode onto an existing conversation right away; a not-yet-saved
    // conversation picks it up when its first turn persists.
    void persist();
  }, [persist]);

  /** Start a fresh conversation (drops session + persistence context). */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    sessionIdRef.current = undefined;
    toolPathsRef.current.clear();
    conversationIdRef.current = null;
    titleRef.current = "";
    createdAtRef.current = 0;
    dirtyRef.current = false;
    modeRef.current = settingsRef.current.defaultMode;
    setModeState(settingsRef.current.defaultMode);
    setActiveId(null);
    setMessages([]);
    setStatus("idle");
  }, []);

  /** Load a stored conversation and resume it (session context via sdkSessionId). */
  const load = useCallback(async (id: string) => {
    abortRef.current?.abort();
    try {
      const res = await fetch(`/api/assistant/conversations/${id}`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) return;
      const { conversation } = (await res.json()) as {
        conversation: {
          id: string;
          title: string;
          createdAt: number;
          sdkSessionId?: string;
          mode?: AssistantMode;
          messages: ChatMessage[];
        };
      };
      sessionIdRef.current = conversation.sdkSessionId;
      conversationIdRef.current = conversation.id;
      titleRef.current = conversation.title;
      createdAtRef.current = conversation.createdAt;
      toolPathsRef.current.clear();
      dirtyRef.current = false;
      const loadedMode: AssistantMode =
        conversation.mode === "autonomous" ? "autonomous" : "confirmation";
      modeRef.current = loadedMode;
      setModeState(loadedMode);
      setMessages(conversation.messages.map(normalizeLoaded));
      setActiveId(conversation.id);
      setStatus("idle");
    } catch {
      // Ignore load failures — the current conversation stays put.
    }
  }, []);

  return { messages, status, activeId, mode, setMode, send, stop, reset, respond, load };
}
