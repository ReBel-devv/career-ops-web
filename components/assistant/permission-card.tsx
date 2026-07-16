"use client";

import { Check, FilePen, FilePlus, Terminal, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PermissionPreview } from "@/lib/assistant/types";
import type {
  PermissionDecision,
  PermissionScope,
} from "./use-assistant-chat";
import type { PermissionRequestState } from "./types";

/** Icon element per gated tool (returns JSX to satisfy static-components lint). */
function toolGlyph(kind: PermissionPreview["kind"], className: string) {
  switch (kind) {
    case "write":
      return <FilePlus className={className} aria-hidden />;
    case "edit":
      return <FilePen className={className} aria-hidden />;
    case "command":
      return <Terminal className={className} aria-hidden />;
    default:
      return <Wrench className={className} aria-hidden />;
  }
}

/** Default heading when the SDK doesn't supply a ready-made title. */
function fallbackTitle(request: PermissionRequestState): string {
  const p = request.preview;
  switch (p.kind) {
    case "write":
      return `Create or overwrite ${p.path}`;
    case "edit":
      return `Edit ${p.path}`;
    case "command":
      return "Run a command";
    default:
      return `Run ${request.name}`;
  }
}

/** A scrolling monospace block used by every preview variant. */
function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-56 overflow-auto rounded-md border bg-background px-3 py-2 font-mono text-xs leading-relaxed",
        className,
      )}
    >
      {children}
    </pre>
  );
}

/** Render the diff / command preview for the pending action. */
function Preview({ preview }: { preview: PermissionPreview }) {
  if (preview.kind === "command") {
    return (
      <div className="space-y-1.5">
        {preview.description ? (
          <p className="text-xs text-muted-foreground">{preview.description}</p>
        ) : null}
        <CodeBlock>
          <code className="whitespace-pre-wrap break-words">
            <span className="select-none text-muted-foreground">$ </span>
            {preview.command}
          </code>
        </CodeBlock>
      </div>
    );
  }

  if (preview.kind === "write") {
    return (
      <CodeBlock>
        <code className="block whitespace-pre-wrap break-words text-status-offer">
          {preview.content || "(empty file)"}
        </code>
      </CodeBlock>
    );
  }

  if (preview.kind === "edit") {
    return (
      <CodeBlock className="space-y-1">
        <code className="block whitespace-pre-wrap break-words rounded bg-destructive/10 px-1 text-destructive">
          {preview.oldString || "(nothing)"}
        </code>
        <code className="block whitespace-pre-wrap break-words rounded bg-status-offer/10 px-1 text-status-offer">
          {preview.newString || "(nothing)"}
        </code>
      </CodeBlock>
    );
  }

  return (
    <CodeBlock>
      <code className="block whitespace-pre-wrap break-words text-muted-foreground">
        {preview.text}
      </code>
    </CodeBlock>
  );
}

/**
 * Confirmation card for one gated tool call (ASSISTANT-PLAN §7 Phase 4): shows a
 * diff (Write/Edit) or command (Bash) with Approve / Decline, plus an "Allow for
 * this conversation" shortcut. Once resolved it collapses to a status line.
 * Monochrome surface; red/green are reserved for diff semantics only (no blue).
 */
export function PermissionCard({
  request,
  onRespond,
}: {
  request: PermissionRequestState;
  onRespond: (requestId: string, decision: PermissionDecision, scope: PermissionScope) => void;
}) {
  const pending = request.status === "pending";
  const heading = request.title ?? fallbackTitle(request);

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-lg border bg-card",
        pending ? "border-foreground/25" : "opacity-80",
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        {toolGlyph(request.preview.kind, "size-4 shrink-0 text-foreground")}
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{heading}</p>
        {!pending ? (
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              request.status === "approved" ? "text-status-offer" : "text-muted-foreground",
            )}
          >
            {request.status === "approved"
              ? request.scope === "conversation"
                ? "Allowed for chat"
                : "Approved"
              : "Declined"}
          </span>
        ) : null}
      </div>

      <div className="px-3 py-2.5">
        <Preview preview={request.preview} />

        {pending ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onRespond(request.requestId, "approve", "once")}
              className="flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <Check className="size-3.5" aria-hidden />
              Approve
            </button>
            <button
              type="button"
              onClick={() => onRespond(request.requestId, "deny", "once")}
              className="flex h-8 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-3.5" aria-hidden />
              Decline
            </button>
            <button
              type="button"
              onClick={() => onRespond(request.requestId, "approve", "conversation")}
              className="ml-auto h-8 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              Allow for this conversation
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
