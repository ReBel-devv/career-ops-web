/**
 * Core runner: drives the Claude Agent SDK `query()` and translates its message
 * stream into our `AssistantEvent` SSE union.
 *
 * Two modes:
 * - **read-only** (`writable: false`): read tools auto-approved via
 *   `permissionMode: "dontAsk"`, everything else denied — no bridge needed.
 * - **writable** (Phase 4): Read/Grep/Glob auto-approved; Write/Edit/Bash gated
 *   behind `canUseTool` (the permission bridge) in confirmation mode, or
 *   auto-approved in autonomous mode. Hard guardrails run in a `PreToolUse`
 *   hook — *before* everything, unbypassable — with `disallowedTools` as a
 *   second layer (see guardrails.ts / ASSISTANT-PLAN §3, §4bis).
 *
 * Because `canUseTool` is a callback (it cannot `yield`), we multiplex it and
 * the SDK message loop through an `EventQueue`.
 */
import { query, type CanUseTool, type HookInput } from "@anthropic-ai/claude-agent-sdk";
import {
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  READ_ONLY_TOOLS,
  WRITE_TOOLS,
} from "./config";
import { EventQueue } from "./event-queue";
import { checkToolUse, DISALLOWED_TOOLS } from "./guardrails";
import { awaitPermission } from "./permission-bridge";
import { buildPreview } from "./preview";
import { buildSystemPrompt } from "./system-prompt";
import type {
  AssistantEffort,
  AssistantEvent,
  AssistantMode,
  AssistantUsageLimit,
} from "./types";

export interface RunAssistantOptions {
  /** The user's message for this turn. */
  message: string;
  /** Working directory — the career-ops data repo (CAREER_OPS_PATH). */
  cwd: string;
  /** Whether mutating tools (Write/Edit/Bash) are exposed at all. */
  writable: boolean;
  /** Autonomy mode. `confirmation` prompts per action; `autonomous` does not. */
  mode: AssistantMode;
  /** Model id (defaults to Opus 4.8). */
  model?: string;
  /** Reasoning effort (defaults to medium). */
  effort?: AssistantEffort;
  /** SDK session id to resume prior context. */
  resume?: string;
  /** Aborted by the Stop button or a client disconnect. */
  abortController: AbortController;
}

/** Map an SDK rate-limit type to our session/weekly classification. */
function classifyRateLimit(raw: unknown): AssistantUsageLimit | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const info = raw as { resetsAt?: number; rateLimitType?: string };
  const rawType = info.rateLimitType;
  let kind: AssistantUsageLimit["kind"] = "other";
  if (rawType === "five_hour") kind = "session";
  else if (typeof rawType === "string" && rawType.startsWith("seven_day")) kind = "weekly";
  return { kind, resetsAt: info.resetsAt, rawType };
}

/** Human-facing error text for an SDK assistant-message error code. */
function describeAssistantError(code: string): string {
  switch (code) {
    case "authentication_failed":
    case "oauth_org_not_allowed":
      return "Not authenticated. Run `claude login` in a terminal, or set ANTHROPIC_API_KEY.";
    case "rate_limit":
      return "Usage limit reached.";
    case "billing_error":
      return "Billing error from the Claude API.";
    case "overloaded":
      return "The service is overloaded — try again shortly.";
    default:
      return `Assistant error: ${code}`;
  }
}

/** Condense a tool_result payload into a one-line journal summary. */
function summarizeToolResult(content: unknown): string {
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((block) =>
        block && typeof block === "object" && "text" in block
          ? String((block as { text: unknown }).text)
          : "",
      )
      .join(" ");
  }
  const firstLine = text.replace(/\s+/g, " ").trim();
  return firstLine.length > 180 ? `${firstLine.slice(0, 180)}…` : firstLine;
}

/** Tool-input keys that name what a tool is acting on, most specific first. */
const TARGET_KEYS = ["file_path", "path", "command", "pattern"] as const;

/**
 * Pull the first fully-quoted target value out of a tool's partially-streamed
 * JSON input (e.g. the `file_path` of a Write before its `content` finishes), so
 * the activity label can name what the agent is working on early. Returns
 * undefined until a complete quoted value is available.
 */
function extractPartialTarget(buf: string): { key: string; value: string } | undefined {
  for (const key of TARGET_KEYS) {
    const match = buf.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (match) {
      try {
        return { key, value: JSON.parse(`"${match[1]}"`) as string };
      } catch {
        return { key, value: match[1] };
      }
    }
  }
  return undefined;
}

const WRITE_TOOL_SET: ReadonlySet<string> = new Set(WRITE_TOOLS);

/**
 * Build the permission callback for writable turns. Hard guardrails are checked
 * here too (defense in depth), but the authoritative boundary is the PreToolUse
 * hook. Supported mutating tools are bridged to the UI (confirmation) or
 * auto-approved (autonomous); every other tool is refused.
 */
function makeCanUseTool(
  opts: RunAssistantOptions,
  queue: EventQueue<AssistantEvent>,
  seqForTool: (toolUseId: string) => number | undefined,
): CanUseTool {
  return async (toolName, input, options) => {
    const verdict = checkToolUse({ toolName, toolInput: input, repoRoot: opts.cwd });
    if (!verdict.ok) {
      return { behavior: "deny", message: verdict.reason ?? "Blocked by a guardrail." };
    }

    if (!WRITE_TOOL_SET.has(toolName)) {
      return { behavior: "deny", message: `The ${toolName} tool isn't available here.` };
    }

    if (opts.mode === "autonomous") {
      return { behavior: "allow" };
    }

    queue.push({
      type: "permission_request",
      requestId: options.requestId,
      name: toolName,
      input,
      preview: buildPreview(toolName, input as Record<string, unknown>),
      title: options.title,
      displayName: options.displayName,
      // Tie the card to its tool block so the UI renders it in sequence.
      seq: seqForTool(options.toolUseID),
    });

    const answer = await awaitPermission(options.requestId, options.signal);
    if (answer.decision === "deny") {
      return { behavior: "deny", message: "You declined this action." };
    }
    return {
      behavior: "allow",
      updatedPermissions:
        answer.scope === "conversation" ? options.suggestions : undefined,
    };
  };
}

/** The unbypassable `PreToolUse` hard-guardrail hook (runs even in bypass mode). */
function preToolUseGuard(opts: RunAssistantOptions) {
  return async (input: HookInput) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const verdict = checkToolUse({
      toolName: input.tool_name,
      toolInput: (input.tool_input ?? {}) as Record<string, unknown>,
      repoRoot: opts.cwd,
    });
    if (verdict.ok) return {};
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "deny" as const,
        permissionDecisionReason: verdict.reason ?? "Blocked by a guardrail.",
      },
    };
  };
}

/**
 * Consume the SDK stream, pushing translated events into `queue`. Never throws:
 * failures are pushed as an `error` event; the queue is always closed at the end.
 */
async function driveQuery(
  opts: RunAssistantOptions,
  queue: EventQueue<AssistantEvent>,
): Promise<void> {
  let lastLimit: AssistantUsageLimit | undefined;
  let errored = false;

  // Block ordering. Each content block (text / thinking / tool_use) gets a
  // monotonic `seq` in stream order, so the UI can interleave them faithfully.
  // Stream `index` restarts at 0 per assistant message, so we map it to a global
  // seq for the duration of the turn.
  let seqCounter = 0;
  const indexToSeq = new Map<number, number>();
  // tool_use blocks stream their input as partial JSON; we take the fully-parsed
  // input from the batched `assistant` message instead, stamped with the seq we
  // recorded when the block started, so it lands in the right place.
  const toolIdToSeq = new Map<string, number>();
  // Per stream-index bookkeeping for a tool_use block that is still streaming its
  // input, so the UI can show "writing file X…" *while* the model generates it —
  // not only once the whole (possibly long) input has arrived.
  const toolMeta = new Map<number, { id: string; name: string }>();
  const toolJson = new Map<number, string>();
  const toolTarget = new Map<number, string>();

  // Emit at most one error per turn — the SDK often reports the same failure at
  // both the assistant-message and result levels (and can then throw).
  const pushError = (event: Extract<AssistantEvent, { type: "error" }>): void => {
    if (errored) return;
    errored = true;
    queue.push(event);
  };

  try {
    const writable = opts.writable;
    const stream = query({
      prompt: opts.message,
      options: {
        cwd: opts.cwd,
        model: opts.model ?? DEFAULT_MODEL,
        effort: opts.effort ?? DEFAULT_EFFORT,
        // Adaptive extended thinking: the model decides when (and how much) to
        // reason. Reasoning streams as `thinking` blocks (distinct from spoken
        // text), which the UI renders in its own collapsible card.
        thinking: { type: "adaptive" },
        abortController: opts.abortController,
        // Reads are always auto-approved. In writable mode, mutating tools are
        // NOT listed here (that would auto-approve them) — they route through
        // canUseTool via permissionMode "default" instead.
        allowedTools: [...READ_ONLY_TOOLS],
        settingSources: [],
        includePartialMessages: true,
        resume: opts.resume,
        env: { ...process.env },
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append: buildSystemPrompt({ readOnly: !writable }),
        },
        ...(writable
          ? {
              permissionMode: "default" as const,
              disallowedTools: [...DISALLOWED_TOOLS],
              canUseTool: makeCanUseTool(opts, queue, (id) => toolIdToSeq.get(id)),
              hooks: {
                PreToolUse: [{ hooks: [preToolUseGuard(opts)] }],
              },
            }
          : {
              // Read-only, locked-down surface: everything but reads is denied.
              permissionMode: "dontAsk" as const,
            }),
      },
    });

    for await (const msg of stream) {
      switch (msg.type) {
        case "system": {
          if (msg.subtype === "init") {
            queue.push({ type: "session", sdkSessionId: msg.session_id });
          }
          break;
        }
        case "stream_event": {
          const event = msg.event as {
            type?: string;
            index?: number;
            content_block?: { type?: string; id?: string; name?: string };
            delta?: { type?: string; text?: string; thinking?: string; partial_json?: string };
          };
          switch (event.type) {
            case "message_start":
              // A new assistant message in this turn — its block indices restart
              // at 0, but seq keeps climbing.
              indexToSeq.clear();
              break;
            case "content_block_start": {
              if (typeof event.index !== "number") break;
              const seq = seqCounter++;
              indexToSeq.set(event.index, seq);
              const blockType = event.content_block?.type;
              if (blockType === "tool_use") {
                const id = event.content_block?.id;
                const name = event.content_block?.name;
                if (id) toolIdToSeq.set(id, seq);
                if (id && name) {
                  // Surface the tool immediately (pending, no input yet) so the
                  // UI shows activity while its input streams. The batched
                  // message (below) later fills the full input.
                  toolMeta.set(event.index, { id, name });
                  toolJson.set(event.index, "");
                  queue.push({ type: "tool_use", seq, id, name, input: {} });
                }
              } else {
                queue.push({
                  type: "block_start",
                  seq,
                  blockType: blockType === "thinking" ? "thinking" : "text",
                });
              }
              break;
            }
            case "content_block_delta": {
              if (typeof event.index !== "number") break;
              const seq = indexToSeq.get(event.index);
              if (seq === undefined) break;
              if (event.delta?.type === "text_delta" && typeof event.delta.text === "string") {
                queue.push({ type: "text_delta", seq, text: event.delta.text });
              } else if (
                event.delta?.type === "thinking_delta" &&
                typeof event.delta.thinking === "string"
              ) {
                queue.push({ type: "thinking_delta", seq, text: event.delta.thinking });
              } else if (
                event.delta?.type === "input_json_delta" &&
                typeof event.delta.partial_json === "string"
              ) {
                // Accumulate the tool's streaming input and, as soon as its
                // target (file path / command / pattern) can be read, re-emit so
                // the activity label reads "writing X…" rather than "writing…".
                const meta = toolMeta.get(event.index);
                if (!meta) break;
                const buf = (toolJson.get(event.index) ?? "") + event.delta.partial_json;
                toolJson.set(event.index, buf);
                const target = extractPartialTarget(buf);
                if (target && toolTarget.get(event.index) !== target.value) {
                  toolTarget.set(event.index, target.value);
                  queue.push({
                    type: "tool_use",
                    seq,
                    id: meta.id,
                    name: meta.name,
                    input: { [target.key]: target.value },
                  });
                }
              }
              break;
            }
            case "content_block_stop": {
              if (typeof event.index !== "number") break;
              const seq = indexToSeq.get(event.index);
              if (seq !== undefined) queue.push({ type: "block_stop", seq });
              break;
            }
          }
          break;
        }
        case "assistant": {
          if (msg.error) {
            const limit = msg.error === "rate_limit" ? lastLimit : undefined;
            pushError({
              type: "error",
              message: describeAssistantError(msg.error),
              code: msg.error,
              limit,
            });
          }
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block && typeof block === "object" && block.type === "tool_use") {
                queue.push({
                  type: "tool_use",
                  seq: toolIdToSeq.get(block.id) ?? seqCounter++,
                  id: block.id,
                  name: block.name,
                  input: block.input,
                });
              }
            }
          }
          break;
        }
        case "user": {
          const content = msg.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block && typeof block === "object" && block.type === "tool_result") {
                queue.push({
                  type: "tool_result",
                  id: block.tool_use_id,
                  ok: block.is_error !== true,
                  summary: summarizeToolResult(block.content),
                });
              }
            }
          }
          break;
        }
        case "rate_limit_event": {
          lastLimit = classifyRateLimit(
            (msg as { rate_limit_info?: unknown }).rate_limit_info,
          );
          break;
        }
        case "result": {
          if (msg.subtype === "success") {
            if (msg.is_error) {
              pushError({
                type: "error",
                message: msg.result?.trim() || "Turn ended with an error.",
                code: msg.api_error_status ? String(msg.api_error_status) : "error",
                limit: lastLimit,
              });
            }
            queue.push({ type: "done", stopReason: msg.stop_reason ?? "success" });
          } else {
            pushError({
              type: "error",
              message: msg.errors?.join("; ").trim() || `Turn ended: ${msg.subtype}`,
              code: msg.subtype,
              limit: lastLimit,
            });
            queue.push({ type: "done", stopReason: msg.stop_reason ?? msg.subtype });
          }
          return;
        }
        default:
          break;
      }
    }

    queue.push({
      type: "done",
      stopReason: opts.abortController.signal.aborted ? "aborted" : null,
    });
  } catch (err) {
    if (opts.abortController.signal.aborted) {
      queue.push({ type: "done", stopReason: "aborted" });
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown assistant error";
    pushError({ type: "error", message });
    queue.push({ type: "done", stopReason: "error" });
  }
}

/**
 * Run one assistant turn, yielding SSE events. Never throws — failures surface
 * as an `error` event followed by `done`.
 */
export async function* runAssistant(
  opts: RunAssistantOptions,
): AsyncGenerator<AssistantEvent> {
  const queue = new EventQueue<AssistantEvent>();
  const driver = driveQuery(opts, queue).finally(() => queue.close());
  try {
    for await (const event of queue) {
      yield event;
    }
  } finally {
    await driver;
  }
}
