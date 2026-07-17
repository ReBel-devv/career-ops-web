"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClientConfig } from "@/components/providers/app-providers";
import {
  useEvaluationJob,
  useStartEvaluation,
  type EvaluationResult,
} from "@/lib/client/queries";

/**
 * Evaluation controls for the Discovery inbox. Each evaluation is a real LLM
 * run (2–5 min, the user's Claude quota), so every trigger is explicit and
 * bounded: one offer per row button, or "Evaluate next N" with a small N.
 * One job at a time server-side; buttons reflect the polled job state, so a
 * reload mid-job re-attaches cleanly.
 */

/** Toast one finished offer. */
function toastResult(result: EvaluationResult) {
  const name =
    [result.company, result.role].filter(Boolean).join(" — ") || result.url;
  if (result.status === "completed") {
    const score = result.score !== null ? ` scored ${result.score}/5` : "";
    const report = result.reportNum ? ` (report #${result.reportNum})` : "";
    toast.success(`${name}${score}${report}`);
  } else if (result.status === "discarded") {
    toast.info(`${name} — skipped by the pre-screen gate`, {
      description: result.error ?? undefined,
    });
  } else {
    toast.error(`Evaluation failed — ${name}`, {
      description: result.error ?? undefined,
    });
  }
}

/**
 * Mounted once on the Discovery page: turns job progress into toasts and
 * refreshes what each finished evaluation wrote (pipeline entry, tracker row,
 * report). Works for jobs started elsewhere (other tab, before a reload) too.
 */
export function EvaluationEffects() {
  const qc = useQueryClient();
  const { data: job } = useEvaluationJob();
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (!job) return;
    // First fetch after mount: a finished job only holds results that were
    // already toasted before the reload/navigation — skip them silently. A
    // running job re-attaches from the start.
    if (seen.current === null) {
      seen.current = job.running ? 0 : job.results.length;
    }
    // A fresh job restarted the results array — reset the cursor.
    if (job.results.length < seen.current) seen.current = 0;
    for (const result of job.results.slice(seen.current)) {
      toastResult(result);
      if (result.status !== "failed") {
        void qc.invalidateQueries({ queryKey: ["pipeline"] });
      }
      if (result.status === "completed") {
        void qc.invalidateQueries({ queryKey: ["applications"] });
        void qc.invalidateQueries({ queryKey: ["report-facets"] });
      }
    }
    seen.current = job.results.length;
  }, [job, qc]);

  return null;
}

/** Per-row "Evaluate" — pending entries with a URL only. */
export function EvaluateButton({ url }: { url: string }) {
  const { assistantWritable } = useClientConfig();
  const { data: job } = useEvaluationJob();
  const start = useStartEvaluation();

  if (!assistantWritable) return null;

  const isCurrent = job?.current === url;
  const isQueued = job?.queued.includes(url) === true;
  const busy = job?.running === true || start.isPending;

  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="shrink-0"
      disabled={busy}
      onClick={() => start.mutate({ url })}
    >
      {isCurrent ? (
        <>
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Evaluating…
        </>
      ) : isQueued ? (
        "Queued"
      ) : (
        <>
          <Sparkles className="size-3" aria-hidden />
          Evaluate
        </>
      )}
    </Button>
  );
}

const BULK_COUNTS = [3, 5, 10] as const;

/** Tab-row "Evaluate next N" — bounded bulk evaluation of the Pending inbox. */
export function EvaluateNextButton() {
  const { assistantWritable } = useClientConfig();
  const { data: job } = useEvaluationJob();
  const start = useStartEvaluation();

  if (!assistantWritable) return null;

  if (job?.running) {
    const total =
      job.results.length + job.queued.length + (job.current ? 1 : 0);
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Evaluating {Math.min(job.results.length + 1, total)}/{total}…
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={start.isPending}
        >
          <Sparkles className="size-3.5" aria-hidden />
          Evaluate next
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Evaluate pending offers</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {BULK_COUNTS.map((count) => (
          <DropdownMenuItem
            key={count}
            onSelect={() => start.mutate({ count })}
          >
            Next {count}
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              ~{count * 3} min
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
