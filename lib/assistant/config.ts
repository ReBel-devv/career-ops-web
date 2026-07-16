/**
 * Static configuration for the embedded assistant: model/effort defaults and
 * the tool surface exposed per phase.
 */
import type { AssistantEffort } from "./types";

/** Default model — Opus 4.8 (Decision §1). Overridable per request. */
export const DEFAULT_MODEL = "claude-opus-4-8";

/** Default reasoning effort. Overridable per request. */
export const DEFAULT_EFFORT: AssistantEffort = "medium";

/**
 * Read-only tool surface (Phase 2). Paired with `permissionMode: "dontAsk"`,
 * these are auto-approved and everything else is denied outright — no
 * `canUseTool` prompt yet.
 *
 * `AskUserQuestion` is intentionally omitted: `dontAsk` mode denies it anyway,
 * and there is no UI to answer clarifying questions until Phase 4. Write/Edit/
 * Bash arrive in Phase 4, gated behind the permission bridge.
 */
export const READ_ONLY_TOOLS = ["Read", "Grep", "Glob"] as const;

/**
 * Mutating tools exposed in writable mode (Phase 4), each gated behind the
 * `canUseTool` confirmation bridge and the hard `PreToolUse` guardrails. Any
 * tool the model tries that is neither read-only nor in this set is denied
 * outright by `canUseTool` — keeping the surface deterministic.
 */
export const WRITE_TOOLS = ["Write", "Edit", "Bash"] as const;

/** Valid effort levels, for request validation. */
export const EFFORT_LEVELS: readonly AssistantEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
