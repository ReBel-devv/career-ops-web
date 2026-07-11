"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutationsEnabled } from "@/components/providers/app-providers";
import { useAddManualOffer, usePipelineItems } from "@/lib/client/queries";
import { addManualOfferInputSchema, type PipelineItem } from "@/lib/domain";
import { cn } from "@/lib/utils";

/** Normalize a URL for a lightweight duplicate check (case + trailing slash). */
function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Add a MANUAL offer (URL + pasted JD) whose posting can't be auto-scanned
 * (LinkedIn, Welcome to the Jungle, …). Queue-only: it saves the JD to `jds/`
 * and appends a `[!]` line to `data/pipeline.md`; the CLI `pipeline` mode does
 * the actual evaluation afterwards. No submit is ever sent to any employer.
 */
export function AddOfferForm() {
  const enabled = useMutationsEnabled();
  const add = useAddManualOffer();
  const { data: pipelineItems } = usePipelineItems();

  const [url, setUrl] = useState("");
  const [jd, setJd] = useState("");
  const [errors, setErrors] = useState<{ url?: string; jd?: string }>({});
  const [added, setAdded] = useState<PipelineItem | null>(null);

  // Soft, non-blocking duplicate signal against what's already in the inbox.
  const duplicate = useMemo(() => {
    const n = normalizeUrl(url);
    if (n.length < 8 || !pipelineItems) return null;
    return pipelineItems.find((i) => i.url && normalizeUrl(i.url) === n) ?? null;
  }, [url, pipelineItems]);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = addManualOfferInputSchema.safeParse({ url, jd });
    if (!parsed.success) {
      const next: { url?: string; jd?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "url" && !next.url) next.url = issue.message;
        if (key === "jd" && !next.jd) next.jd = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    add.mutate(parsed.data, {
      onSuccess: (item) => {
        setAdded(item);
        setUrl("");
        setJd("");
        toast.success("Offer queued — run /career-ops pipeline to evaluate");
      },
      onError: (error) =>
        toast.error("Couldn't add the offer", {
          description: error instanceof Error ? error.message : String(error),
        }),
    });
  }

  if (added) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <div className="flex items-start gap-3 rounded-lg border border-score-high/30 bg-score-high/5 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-score-high" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Added to the pipeline inbox</p>
            <p className="mt-1 text-muted-foreground">
              The job description was saved to{" "}
              <code className="font-mono text-xs">{added.localJd}</code> and queued
              in <code className="font-mono text-xs">data/pipeline.md</code>. Run{" "}
              <code className="font-mono text-xs">/career-ops pipeline</code> to
              evaluate it — the dashboard only queues, it never evaluates.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setAdded(null)}>
            Add another
          </Button>
          <Button asChild variant="ghost">
            <Link href="/discovery">Back to Discovery</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-5">
      {!enabled ? (
        <div
          role="note"
          className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Adding offers is disabled in read-only mode.
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="offer-url" className="text-sm font-medium">
          Job posting URL
        </label>
        <Input
          id="offer-url"
          type="url"
          inputMode="url"
          placeholder="https://www.welcometothejungle.com/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!enabled || add.isPending}
          aria-invalid={errors.url ? true : undefined}
          aria-describedby={errors.url ? "offer-url-error" : undefined}
        />
        {errors.url ? (
          <p id="offer-url-error" className="text-xs text-destructive">
            {errors.url}
          </p>
        ) : null}
        {!errors.url && duplicate ? (
          <p className="flex items-center gap-1.5 text-xs text-score-mid">
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            This URL is already in the pipeline inbox — you can still add it.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="offer-jd" className="text-sm font-medium">
          Job description
        </label>
        <p className="text-xs text-muted-foreground">
          Paste the full posting text — this is what gets evaluated (the URL can&apos;t
          be auto-fetched).
        </p>
        <Textarea
          id="offer-jd"
          rows={14}
          placeholder="Paste the job description here…"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          disabled={!enabled || add.isPending}
          aria-invalid={errors.jd ? true : undefined}
          aria-describedby={errors.jd ? "offer-jd-error" : undefined}
          className={cn("min-h-48 font-mono text-xs leading-relaxed")}
        />
        {errors.jd ? (
          <p id="offer-jd-error" className="text-xs text-destructive">
            {errors.jd}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!enabled || add.isPending}>
          {add.isPending ? "Adding…" : "Add to pipeline"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/discovery">Cancel</Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Queue-only — nothing is sent to the employer. The offer lands in the
        Pending inbox marked <span className="font-mono">manual</span>; evaluate it
        with <code className="font-mono">/career-ops pipeline</code>.
      </p>
    </form>
  );
}
