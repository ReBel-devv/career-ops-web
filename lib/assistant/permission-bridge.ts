/**
 * In-process bridge between the streaming `canUseTool` callback (in the chat
 * route) and the out-of-band decision made by the user (posted to the
 * permission route). Both run in the same local Node process, so a module
 * singleton keyed by the SDK's `requestId` is enough (ASSISTANT-PLAN §6).
 *
 * The map is stashed on `globalThis` so it survives dev HMR / separate route
 * bundles — otherwise the chat route and the permission route could see
 * different module instances and the decision would never reach the waiter.
 */

/** A user's answer to one permission request. */
export interface PermissionDecision {
  decision: "approve" | "deny";
  /** "conversation" upgrades to an always-allow rule for the session. */
  scope: "once" | "conversation";
}

interface PendingEntry {
  resolve: (decision: PermissionDecision) => void;
  cleanup: () => void;
}

const GLOBAL_KEY = Symbol.for("career-ops.assistant.permissionBridge");

type BridgeStore = Map<string, PendingEntry>;

function store(): BridgeStore {
  const g = globalThis as unknown as Record<symbol, BridgeStore | undefined>;
  return (g[GLOBAL_KEY] ??= new Map());
}

/**
 * Register a pending permission request and return a promise that resolves once
 * the user answers (via `resolvePermission`) or the turn is aborted. On abort
 * we fail closed with a `deny` decision so the tool never runs unattended.
 */
export function awaitPermission(
  requestId: string,
  signal: AbortSignal,
): Promise<PermissionDecision> {
  const pending = store();
  return new Promise<PermissionDecision>((resolve) => {
    if (signal.aborted) {
      resolve({ decision: "deny", scope: "once" });
      return;
    }

    const onAbort = () => {
      pending.delete(requestId);
      resolve({ decision: "deny", scope: "once" });
    };
    signal.addEventListener("abort", onAbort, { once: true });

    pending.set(requestId, {
      resolve,
      cleanup: () => signal.removeEventListener("abort", onAbort),
    });
  });
}

/**
 * Resolve a pending permission request with the user's decision. Returns false
 * if no such request is waiting (unknown / already-answered / expired id).
 */
export function resolvePermission(
  requestId: string,
  decision: PermissionDecision,
): boolean {
  const pending = store();
  const entry = pending.get(requestId);
  if (!entry) return false;
  pending.delete(requestId);
  entry.cleanup();
  entry.resolve(decision);
  return true;
}
