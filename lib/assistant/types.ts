/**
 * Shared types for the embedded Claude Agent SDK assistant.
 *
 * The SSE event union is the contract between the streaming route
 * (`app/api/assistant/chat`) and the UI client. It is intentionally a superset
 * of what Phase 2 emits — later phases add `permission_request` etc. without
 * breaking the wire format (each event is self-describing via `type`).
 */

/** Reasoning effort levels accepted by the SDK (`effort` option). */
export type AssistantEffort = "low" | "medium" | "high" | "xhigh" | "max";

/** Conversation autonomy. Phase 2 is read-only, so this is informational for now. */
export type AssistantMode = "confirmation" | "autonomous";

/** Body of `POST /api/assistant/chat`. */
export interface AssistantChatRequest {
  /** The user's message for this turn. */
  message: string;
  /** Local conversation id (persistence lands in Phase 6). */
  conversationId?: string;
  /** Autonomy mode (Phase 7). Ignored while the agent is read-only. */
  mode?: AssistantMode;
  /** SDK session id to resume a prior turn's context (Phase 6). */
  resume?: string;
  /** Model override (defaults to `claude-opus-4-8`). */
  model?: string;
  /** Effort override (defaults to `medium`). */
  effort?: AssistantEffort;
}

/**
 * Usage-limit detail surfaced on an `error` event. Derived from the SDK's
 * `SDKRateLimitInfo` — `five_hour` maps to the session limit, `seven_day*`
 * to the weekly limit (see ASSISTANT-PLAN.md §4bis).
 */
export interface AssistantUsageLimit {
  kind: "session" | "weekly" | "other";
  /** Reset time as an epoch (seconds) when the SDK provides one. */
  resetsAt?: number;
  /** Raw SDK rate-limit type, for diagnostics. */
  rawType?: string;
}

/**
 * Preview payload for a permission card. `write`/`edit` render a diff; `command`
 * renders a shell command; `generic` is a fallback for any other gated tool.
 */
export type PermissionPreview =
  | { kind: "write"; path: string; content: string }
  | { kind: "edit"; path: string; oldString: string; newString: string }
  | { kind: "command"; command: string; description?: string }
  | { kind: "generic"; text: string };

/** A pending confirmation the UI must resolve (diff / command + Approve/Deny). */
export interface AssistantPermissionRequest {
  requestId: string;
  /** Tool name (Write / Edit / Bash / …). */
  name: string;
  /** Raw tool input, for the action journal. */
  input: unknown;
  /** Rendered preview for the card. */
  preview: PermissionPreview;
  /** Ready-to-show sentence from the SDK ("Claude wants to …"), when present. */
  title?: string;
  /** Short noun phrase for a compact button label. */
  displayName?: string;
}

/** One server-sent event in the assistant stream. */
export type AssistantEvent =
  | { type: "session"; sdkSessionId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  | ({ type: "permission_request" } & AssistantPermissionRequest)
  | { type: "error"; message: string; code?: string; limit?: AssistantUsageLimit }
  | { type: "done"; stopReason: string | null };
