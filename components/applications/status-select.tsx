"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { STATUS_DOT_CLASS } from "@/components/data/status-indicator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import type { Application, CanonicalState } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * Inline status editor for a tracker row — the minimal M1 write surface.
 * Optimistic update, undo toast (any canonical move is allowed and every
 * move is reversible — Decision 5), follow-up-seed toast on → Applied.
 */

/** Client-safe view of the PATCH response (full schema lives server-side). */
const patchResponseSchema = z.looseObject({
  notesSanitized: z.boolean().optional(),
  followupSeed: z
    .looseObject({
      ran: z.boolean().optional(),
      error: z.string().optional(),
      result: z
        .looseObject({
          seeded: z.boolean(),
          nextDate: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const errorResponseSchema = z.looseObject({
  error: z.string().optional(),
});

export function StatusSelect({
  app,
  states,
}: {
  app: Application;
  states: CanonicalState[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [optimisticId, setOptimisticId] = useState<string | null>(null);

  const currentId = optimisticId ?? app.statusId;
  const current = states.find((s) => s.id === currentId) ?? null;

  // Refs so the undo-toast closure (created in an earlier render) always
  // reads the LIVE values instead of its stale captured ones.
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  async function change(nextId: string, isUndo = false): Promise<void> {
    const nextState = states.find((s) => s.id === nextId);
    if (!nextState || nextId === currentIdRef.current || pendingRef.current) {
      return;
    }
    const previousId = currentIdRef.current;

    setOptimisticId(nextId);
    setPending(true);
    let response: Response;
    try {
      response = await fetch(`/api/applications/${app.num}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: nextState.label,
          expected: { company: app.company, role: app.role },
        }),
      });
    } catch (err: unknown) {
      setOptimisticId(previousId);
      setPending(false);
      toast.error(`Couldn't update #${app.num}`, {
        description: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    setPending(false);

    if (!response.ok) {
      setOptimisticId(previousId);
      const body = errorResponseSchema.safeParse(
        await response.json().catch(() => ({})),
      );
      toast.error(`Couldn't update #${app.num} (${response.status})`, {
        description: body.success ? body.data.error : undefined,
      });
      if (response.status === 409) router.refresh();
      return;
    }

    const parsed = patchResponseSchema.safeParse(
      await response.json().catch(() => ({})),
    );
    const previousState = states.find((s) => s.id === previousId);
    toast.success(`#${app.num} ${app.company} → ${nextState.label}`, {
      action:
        !isUndo && previousState
          ? {
              label: "Undo",
              onClick: () => void change(previousState.id, true),
            }
          : undefined,
    });
    const seed = parsed.success ? parsed.data.followupSeed : undefined;
    if (seed?.result?.seeded) {
      toast.info(
        seed.result.nextDate
          ? `Follow-up pinned for ${seed.result.nextDate}`
          : "Follow-up pinned",
      );
    } else if (seed?.error) {
      toast.warning("Follow-up seeding failed", { description: seed.error });
    }
    router.refresh();
  }

  return (
    <Select
      value={current?.id ?? ""}
      onValueChange={(id) => void change(id)}
      disabled={pending}
    >
      <SelectTrigger
        size="sm"
        aria-label={`Status of #${app.num} ${app.company}`}
        className="h-7 gap-1.5 border-transparent bg-transparent px-1.5 text-data shadow-none hover:border-input dark:bg-transparent dark:hover:bg-input/30"
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              (current && STATUS_DOT_CLASS[current.dashboardGroup]) ??
                "bg-muted-foreground/40",
            )}
          />
          {current?.label ?? app.statusRaw}
        </span>
      </SelectTrigger>
      <SelectContent>
        {states.map((state) => (
          <SelectItem key={state.id} value={state.id} className="text-data">
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full",
                STATUS_DOT_CLASS[state.dashboardGroup] ??
                  "bg-muted-foreground/40",
              )}
            />
            {state.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
