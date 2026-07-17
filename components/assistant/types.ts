/** Client-side conversation model for the embedded assistant UI. */
import type { PermissionPreview } from "@/lib/assistant/types";

export type ChatRole = "user" | "assistant";

/** Lifecycle of a permission card once the user (or an abort) resolves it. */
export type PermissionStatus = "pending" | "approved" | "denied";

/** A tool confirmation surfaced in the transcript (diff / command + actions). */
export interface PermissionRequestState {
  requestId: string;
  name: string;
  preview: PermissionPreview;
  title?: string;
  status: PermissionStatus;
  /** Scope chosen when approved ("conversation" = always-allow this session). */
  scope?: "once" | "conversation";
  /** `seq` of the gated tool block, so the card renders in sequence, not at the end. */
  seq?: number;
}

/** One tool call in the collapsible action journal. */
export interface ActionLogEntry {
  /** tool_use id (matches the later tool_result). */
  id: string;
  name: string;
  input?: unknown;
  /** Set once the tool result arrives. */
  ok?: boolean;
  summary?: string;
}

/**
 * One ordered block of an assistant turn. Blocks are kept in `seq` order so the
 * transcript renders text, reasoning and tool calls interleaved exactly as the
 * agent produced them. `done` marks a block whose stream has ended (used to stop
 * the typewriter animation / freeze the thinking timer).
 */
export type AssistantBlock =
  | { kind: "text"; seq: number; text: string; done?: boolean }
  | { kind: "thinking"; seq: number; text: string; done?: boolean }
  | ({ kind: "tool"; seq: number } & ActionLogEntry);

/** Usage-limit detail attached to an assistant error (session vs weekly + reset). */
export interface UsageLimitInfo {
  kind: "session" | "weekly" | "other";
  resetsAt?: number;
}

export interface ChatError {
  message: string;
  limit?: UsageLimitInfo;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Plain text for user turns; unused for assistant turns (see `blocks`). */
  content: string;
  /**
   * Ordered text/thinking/tool blocks (assistant turns only). Replaces the old
   * flat `content` string + separate `logs` array, which lost the interleaving
   * between narration and tool calls.
   */
  blocks: AssistantBlock[];
  /** Pending/resolved permission cards for this turn (assistant turns only). */
  permissions: PermissionRequestState[];
  error?: ChatError;
  /** True while this assistant turn is still streaming. */
  streaming?: boolean;
}

export type ChatStatus = "idle" | "streaming";

/** One row in the history list (mirrors the store's index entry). */
export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}
