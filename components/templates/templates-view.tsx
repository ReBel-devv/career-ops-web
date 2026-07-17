"use client";

import Link from "next/link";
import { History, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTemplates } from "@/lib/client/queries";
import { CopyButton } from "./copy-button";
import { NewTemplateDialog } from "./new-template-dialog";

/**
 * /templates — the library. Each card links to the editor; the copy button
 * (the page's core job) works right from the list without opening anything.
 * Stretched-link pattern keeps the whole card clickable with a nested button.
 */
export function TemplatesView() {
  const query = useTemplates();

  if (query.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">Could not load templates</p>
        <p className="mt-1 text-muted-foreground">
          {query.error instanceof Error ? query.error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  const templates = query.data ?? [];

  // Empty state: the create action lives here (and only here) — the header
  // button would be a duplicate CTA on an otherwise empty page.
  if (templates.length === 0) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-6 text-center">
        {/* Stacked-cards illustration, pure CSS so it follows the theme. */}
        <div className="relative w-56 pt-5" aria-hidden>
          <div className="absolute inset-x-6 top-0 h-14 rounded-lg border bg-card opacity-40" />
          <div className="absolute inset-x-3 top-2.5 h-14 rounded-lg border bg-card opacity-70" />
          <div className="relative flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
            <div className="size-9 shrink-0 rounded-md bg-muted" />
            <div className="flex w-full flex-col gap-2">
              <div className="h-2 w-3/4 rounded-full bg-muted" />
              <div className="h-2 w-2/5 rounded-full bg-muted/60" />
            </div>
          </div>
        </div>
        <div className="flex max-w-sm flex-col gap-1.5">
          <p className="text-base font-semibold">No templates yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first one — from a prompt (the agent drafts it from
            your profile) or from a blank page. Every version is kept.
          </p>
        </div>
        <NewTemplateDialog
          trigger={
            <Button type="button" variant="secondary">
              <Plus aria-hidden />
              New template
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs text-muted-foreground">
          {templates.length} template{templates.length === 1 ? "" : "s"}
        </p>
        <NewTemplateDialog />
      </div>

      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <li
            key={template.slug}
            className="relative flex flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:border-muted-foreground/40"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-medium">
                <Link
                  href={`/templates/${template.slug}`}
                  className="after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {template.title}
                </Link>
              </h2>
              {template.type ? (
                <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                  {template.type}
                </Badge>
              ) : null}
            </div>
            <p className="line-clamp-3 text-data text-muted-foreground">
              {template.excerpt || "(empty)"}
            </p>
            <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2">
              <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <History className="size-3" aria-hidden />
                v{template.versionCount}
                <span aria-hidden>·</span>
                {template.savedAt.slice(0, 10) || "—"}
              </p>
              {/* z-10 lifts the button above the stretched link. */}
              <div className="relative z-10">
                <CopyButton text={template.body} size="xs" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
