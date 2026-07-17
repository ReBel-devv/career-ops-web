"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ScoreBadge } from "@/components/data/score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePipelineItems } from "@/lib/client/queries";
import { parseScoreCell } from "@/lib/domain/parse";
import type { PipelineItem, PipelineItemKind } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { EvaluateButton } from "./evaluate";

/**
 * Pipeline inbox tab — data/pipeline.md. Read-only rendering, with one write
 * affordance per pending row: "Evaluate" (the headless worker job — see
 * components/discovery/evaluate.tsx).
 */
export function PipelineInbox() {
  const { data, isLoading, isError, error } = usePipelineItems();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <div
        role="alert"
        className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">Could not load the pipeline inbox</p>
        <p className="mt-1 text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const items = data ?? [];
  const pending = items.filter((i) => i.section === "pending");
  const processed = items.filter((i) => i.section === "processed");

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Pending URLs">
        <h2 className="text-sm font-medium">
          Pending{" "}
          <span className="font-mono text-xs text-muted-foreground">
            {pending.length}
          </span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Inbox empty — paste URLs into data/pipeline.md or run a scan.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y rounded-lg border bg-card">
            {pending.map((item) => (
              <PipelineRow key={item.raw} item={item} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Processed URLs">
        <h2 className="text-sm font-medium">
          Processed{" "}
          <span className="font-mono text-xs text-muted-foreground">
            {processed.length}
          </span>
        </h2>
        {processed.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing processed yet.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y rounded-lg border bg-card">
            {processed.map((item) => (
              <PipelineRow key={item.raw} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const KIND_LABEL: Record<PipelineItemKind, string> = {
  pending: "pending",
  done: "evaluated",
  dup: "dup",
  skip: "skip",
  screened: "screened",
  manual: "manual",
};

function PipelineRow({ item }: { item: PipelineItem }) {
  // A screened line is a free-prose batch summary — render it whole.
  if (item.kind === "screened") {
    return (
      <li className="flex items-start gap-3 px-3 py-2.5">
        <KindBadge kind={item.kind} />
        <p className="min-w-0 break-words text-data text-muted-foreground">
          {item.raw.replace(/^-\s*\[screened\]\s*/i, "")}
        </p>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
      <KindBadge kind={item.kind} />
      {item.reportNum !== null ? (
        <Link
          href={`/app/${item.reportNum}`}
          className="font-mono text-data text-primary hover:underline"
        >
          #{String(item.reportNum).padStart(3, "0")}
        </Link>
      ) : null}
      <span className="text-data font-medium">
        {item.company ?? (item.kind === "manual" ? "Awaiting evaluation" : "—")}
      </span>
      <span className="text-data text-muted-foreground">{item.role ?? ""}</span>
      {item.scoreRaw ? (
        <ScoreBadge raw={item.scoreRaw} score={parseScoreCell(item.scoreRaw)} />
      ) : null}
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto inline-flex max-w-full items-center gap-1 truncate font-mono text-xs text-muted-foreground hover:text-foreground hover:underline sm:max-w-96"
          title={item.url}
        >
          <span className="truncate">
            {item.url.replace(/^https?:\/\//, "")}
          </span>
          <ExternalLink aria-hidden className="size-3 shrink-0" />
          <span className="sr-only">(opens the job posting)</span>
        </a>
      ) : null}
      {item.section === "pending" && item.url ? (
        <EvaluateButton url={item.url} />
      ) : null}
    </li>
  );
}

function KindBadge({ kind }: { kind: PipelineItemKind }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[11px] leading-none",
        // Manual adds (dashboard) get a subtle accent so they stand out from
        // scanner-written pending rows.
        kind === "manual"
          ? "border-primary/40 text-primary"
          : "text-muted-foreground",
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}
