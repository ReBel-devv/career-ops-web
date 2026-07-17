"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { History, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTemplates } from "@/lib/client/queries";
import { CopyButton } from "./copy-button";
import { NewTemplateDialog } from "./new-template-dialog";

/**
 * /templates — the library. Each card links to the editor; the copy button
 * (the page's core job) works right from the list without opening anything.
 * Stretched-link pattern keeps the whole card clickable with a nested button.
 *
 * Type filter: a segmented control (same Tabs primitive as Discovery) whose
 * options derive from the data — new types appear automatically. Like the
 * board's FilterBar, the selection lives in the URL (`?type=`) so it survives
 * reload and deep links.
 */
export function TemplatesView() {
  const query = useTemplates();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedType = searchParams.get("type");

  function setType(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("type");
    else params.set("type", value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

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
            Create your first one — from a prompt (the agent drafts it from your
            profile) or from a blank page. Every version is kept.
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

  // Type facet, derived from the data (extensible: new types show up on their
  // own). The control renders only when it can actually narrow the list.
  const typeCounts = new Map<string, number>();
  for (const t of templates) {
    if (t.type) typeCounts.set(t.type, (typeCounts.get(t.type) ?? 0) + 1);
  }
  const typeOptions = [...typeCounts.keys()].sort();
  const filterable =
    typeOptions.length > 1 ||
    (typeOptions.length === 1 &&
      (typeCounts.get(typeOptions[0]) ?? 0) < templates.length);

  const visible = selectedType
    ? templates.filter((t) => t.type === selectedType)
    : templates;

  // In the mono font, "N templates" is always wider than "M of N" (M ≤ N), so
  // it can reserve the counter's width for both variants.
  const countLabel = `${templates.length} template${templates.length === 1 ? "" : "s"}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Both counter variants stack in one grid cell; the invisible widest
            one fixes the width so toggling the filter never shifts the tabs. */}
        <p className="grid font-mono text-xs text-muted-foreground">
          <span className="col-start-1 row-start-1">
            {selectedType
              ? `${visible.length} of ${templates.length}`
              : countLabel}
          </span>
          <span aria-hidden className="invisible col-start-1 row-start-1">
            {countLabel}
          </span>
        </p>
        {filterable ? (
          <Tabs value={selectedType ?? "all"} onValueChange={setType}>
            <TabsList aria-label="Filter by type" className="h-8">
              <TabsTrigger value="all" className="px-2.5 text-xs">
                All
              </TabsTrigger>
              {typeOptions.map((type) => (
                <TabsTrigger key={type} value={type} className="px-2.5 text-xs">
                  {type}
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {typeCounts.get(type)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : null}
        <div className="ms-auto">
          <NewTemplateDialog />
        </div>
      </div>

      {/* Filtered-out empty state — never a dead end: one click back to All.
          Also reached via a stale ?type= deep link whose type no longer exists. */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm font-medium">No “{selectedType}” templates</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Nothing carries this type — create one, or clear the filter.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setType("all")}
          >
            Show all templates
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((template) => (
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
                  <Badge
                    variant="outline"
                    className="shrink-0 font-mono text-[10px]"
                  >
                    {template.type}
                  </Badge>
                ) : null}
              </div>
              <p className="line-clamp-3 text-data text-muted-foreground">
                {template.excerpt || "(empty)"}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 border-t pt-2">
                <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <History className="size-3" aria-hidden />v
                  {template.versionCount}
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
      )}
    </div>
  );
}
