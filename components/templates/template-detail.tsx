"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Loader2, RotateCcw, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchTemplateVersion,
  useTemplate,
  useTemplateActions,
  useTemplateAssist,
} from "@/lib/client/queries";
import type { TemplateAssistResult, TemplateVersion } from "@/lib/domain";
import { CopyButton } from "./copy-button";
import { DiffView } from "./diff-view";

/**
 * /templates/[slug] — the editor. Three ways a new version is born, all
 * through the same save mutation (optimistic concurrency via `savedAt`):
 * - direct edit + Save (source: manual)
 * - agent revision → diff → Approve (source: agent) — the proposal is never
 *   written before approval
 * - history → Restore (source: restore)
 *
 * Draft model: `draft === null` mirrors the server; the first keystroke forks
 * it. A successful save drops the draft back to the (updated) server state.
 */
export function TemplateDetail({ slug }: { slug: string }) {
  const query = useTemplate(slug);
  const { save } = useTemplateActions();
  const assist = useTemplateAssist();

  const [draft, setDraft] = useState<{
    title: string;
    type: string;
    body: string;
  } | null>(null);
  const [revisePrompt, setRevisePrompt] = useState("");
  const [proposal, setProposal] = useState<TemplateAssistResult | null>(null);
  const [viewed, setViewed] = useState<(TemplateVersion & { body: string }) | null>(
    null,
  );
  const [loadingVersion, setLoadingVersion] = useState<number | null>(null);

  if (query.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div
        role="alert"
        className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">Could not load this template</p>
        <p className="mt-1 text-muted-foreground">
          {query.error instanceof Error ? query.error.message : "Not found."}
        </p>
        <Link
          href="/templates"
          className="mt-2 inline-block text-primary underline underline-offset-2"
        >
          Back to templates
        </Link>
      </div>
    );
  }

  const { template, versions } = query.data;
  const current = draft ?? {
    title: template.title,
    type: template.type ?? "",
    body: template.body,
  };
  const dirty =
    draft !== null &&
    (draft.title !== template.title ||
      draft.type !== (template.type ?? "") ||
      draft.body !== template.body);
  const saving = save.isPending;

  function commit(input: {
    title: string;
    type: string | null;
    body: string;
    source: "manual" | "agent" | "restore";
    note?: string;
  }) {
    save.mutate(
      { slug, expectedSavedAt: template.savedAt, ...input },
      {
        onSuccess: () => {
          setDraft(null);
          setProposal(null);
          setViewed(null);
          setRevisePrompt("");
        },
      },
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* ------------------------------------------------------ editor --- */}
      <div className="flex flex-col gap-4">
        <section
          aria-label="Template editor"
          className="flex flex-col gap-3 rounded-lg border bg-card p-4"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Template title"
              value={current.title}
              onChange={(e) => setDraft({ ...current, title: e.target.value })}
            />
            <Input
              aria-label="Template type"
              className="sm:w-36"
              placeholder="type (email, linkedin…)"
              value={current.type}
              onChange={(e) => setDraft({ ...current, type: e.target.value })}
            />
          </div>
          <Textarea
            aria-label="Template body"
            className="min-h-[320px] font-mono text-data"
            value={current.body}
            onChange={(e) => setDraft({ ...current, body: e.target.value })}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="font-mono text-[11px] text-muted-foreground">
              v{versions[0]?.version ?? 1} · {template.savedAt.slice(0, 10) || "—"} ·{" "}
              {template.source}
              {dirty ? " · unsaved changes" : ""}
            </p>
            <div className="flex items-center gap-2">
              <CopyButton text={current.body} />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!dirty || saving || current.title.trim().length === 0}
                onClick={() =>
                  commit({
                    title: current.title.trim(),
                    type: current.type.trim() || null,
                    body: current.body,
                    source: "manual",
                  })
                }
              >
                {saving ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Save aria-hidden />
                )}
                Save
              </Button>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ agent panel --- */}
        <section
          aria-label="Ask the agent"
          className="flex flex-col gap-3 rounded-lg border bg-card p-4"
        >
          <header>
            <h2 className="text-sm font-medium">Ask the agent</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Describe the change — the revision comes back as a diff you
              approve (or discard). Nothing is saved without your approval.
            </p>
          </header>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="Revision instruction"
              placeholder="e.g. Rends-le plus court et moins formel"
              value={revisePrompt}
              onChange={(e) => setRevisePrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && revisePrompt.trim() && !assist.isPending) {
                  assist.mutate(
                    {
                      prompt: revisePrompt.trim(),
                      current: {
                        title: current.title,
                        type: current.type || null,
                        body: current.body,
                      },
                    },
                    { onSuccess: setProposal },
                  );
                }
              }}
              disabled={assist.isPending}
            />
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              disabled={revisePrompt.trim().length === 0 || assist.isPending}
              onClick={() =>
                assist.mutate(
                  {
                    prompt: revisePrompt.trim(),
                    current: {
                      title: current.title,
                      type: current.type || null,
                      body: current.body,
                    },
                  },
                  { onSuccess: setProposal },
                )
              }
            >
              {assist.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Sparkles aria-hidden />
              )}
              Propose
            </Button>
          </div>

          {proposal ? (
            <div className="flex flex-col gap-2">
              {proposal.title !== current.title ? (
                <p className="text-xs text-muted-foreground">
                  Title → <span className="text-foreground">{proposal.title}</span>
                </p>
              ) : null}
              <DiffView before={current.body} after={proposal.body} />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setProposal(null)}
                  disabled={saving}
                >
                  Discard
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    commit({
                      title: proposal.title.trim() || current.title,
                      type: proposal.type ?? (current.type || null),
                      body: proposal.body,
                      source: "agent",
                      note: revisePrompt.trim().slice(0, 400),
                    })
                  }
                >
                  {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  Approve & save
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        {/* --------------------------------------------- version viewer --- */}
        {viewed ? (
          <section
            aria-label={`Version ${viewed.version}`}
            className="flex flex-col gap-3 rounded-lg border bg-card p-4"
          >
            <header className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium">
                  v{viewed.version}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    · {viewed.savedAt.slice(0, 10)} · {viewed.source}
                  </span>
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Diff against the current version.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close version view"
                onClick={() => setViewed(null)}
              >
                <X aria-hidden />
              </Button>
            </header>
            <DiffView before={current.body} after={viewed.body} />
            <div className="flex justify-end gap-2">
              <CopyButton text={viewed.body} label="Copy this version" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || viewed.body === template.body}
                onClick={() =>
                  commit({
                    title: current.title.trim() || template.title,
                    type: current.type.trim() || null,
                    body: viewed.body,
                    source: "restore",
                    note: `restored v${viewed.version}`,
                  })
                }
              >
                <RotateCcw aria-hidden />
                Restore this version
              </Button>
            </div>
          </section>
        ) : null}
      </div>

      {/* ----------------------------------------------------- history --- */}
      <aside
        aria-label="Version history"
        className="flex flex-col gap-2 rounded-lg border bg-card p-4"
      >
        <h2 className="text-sm font-medium">History</h2>
        <p className="text-xs text-muted-foreground">
          Every save keeps a version — click one to compare and restore.
        </p>
        <ul className="mt-1 flex flex-col divide-y">
          {versions.map((version) => {
            const active = viewed?.version === version.version;
            return (
              <li key={version.version}>
                <button
                  type="button"
                  aria-pressed={active}
                  className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-sm px-2 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                    active ? "bg-muted" : "hover:bg-muted/60"
                  }`}
                  onClick={async () => {
                    if (active) {
                      setViewed(null);
                      return;
                    }
                    setLoadingVersion(version.version);
                    try {
                      setViewed(await fetchTemplateVersion(slug, version.version));
                    } catch (error) {
                      toast.error("Couldn't load this version", {
                        description:
                          error instanceof Error ? error.message : String(error),
                      });
                    } finally {
                      setLoadingVersion(null);
                    }
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold tabular-nums">
                      v{version.version}
                    </span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {version.source}
                    </Badge>
                    {loadingVersion === version.version ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    ) : null}
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                      {version.savedAt.slice(0, 10)}
                    </span>
                  </span>
                  {version.note ? (
                    <span className="line-clamp-2 text-[11px] text-muted-foreground">
                      {version.note}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}

/** Shared back link for the detail page header. */
export function TemplatesBackLink() {
  return (
    <Link
      href="/templates"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ArrowLeft className="size-3.5" aria-hidden />
      Templates
    </Link>
  );
}
