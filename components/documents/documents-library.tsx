"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Download,
  Eye,
  FileText,
  Mail,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_DOT_CLASS } from "@/components/data/status-indicator";
import { useGeneratedDocuments, useStates } from "@/lib/client/queries";
import type { CanonicalState, GeneratedDocument } from "@/lib/domain";
import { cn } from "@/lib/utils";

type KindFilter = "all" | "cv" | "cover-letter";
type SortKey = "recent" | "oldest" | "company" | "size";

const KIND_TABS: Array<{ id: KindFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "cv", label: "CVs" },
  { id: "cover-letter", label: "Letters" },
];

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: "recent", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "company", label: "Company A–Z" },
  { id: "size", label: "Largest first" },
];

function formatSize(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(date: string | null): string {
  if (!date) return "Undated";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function docUrl(fileName: string): string {
  return `/api/files/pdf/${encodeURIComponent(fileName)}`;
}

function haystack(doc: GeneratedDocument): string {
  return [doc.company, doc.role, doc.fileName, doc.statusLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * The generated-documents library: every tailored CV and cover letter across
 * applications, searchable (company / role / filename), filterable by kind, and
 * sortable. PDFs preview inline and download through the shared file route.
 */
export function DocumentsLibrary() {
  const { data, isLoading, isError, error } = useGeneratedDocuments();
  const { data: states } = useStates();

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [preview, setPreview] = useState<GeneratedDocument | null>(null);

  const dashboardGroupById = useMemo(() => {
    const map = new Map<string, CanonicalState["dashboardGroup"]>();
    for (const s of states ?? []) map.set(s.id, s.dashboardGroup);
    return map;
  }, [states]);

  const counts = useMemo(() => {
    const all = data ?? [];
    return {
      total: all.length,
      cv: all.filter((d) => d.kind === "cv").length,
      cover: all.filter((d) => d.kind === "cover-letter").length,
    };
  }, [data]);

  const visible = useMemo(() => {
    let list = data ?? [];
    if (kind !== "all") list = list.filter((d) => d.kind === kind);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((d) => haystack(d).includes(q));
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return (a.generatedDate ?? "").localeCompare(b.generatedDate ?? "");
        case "company":
          return (a.company ?? "~").localeCompare(b.company ?? "~");
        case "size":
          return b.sizeBytes - a.sizeBytes;
        case "recent":
        default:
          return (b.generatedDate ?? "").localeCompare(a.generatedDate ?? "");
      }
    });
    return sorted;
  }, [data, kind, query, sort]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        role="alert"
        className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">Could not load your documents</p>
        <p className="mt-1 text-muted-foreground">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  if (counts.total === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
        <FileText className="mx-auto size-6 text-muted-foreground" aria-hidden />
        <p className="mt-3 text-sm font-medium">No documents yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Tailored CVs and cover letters land here as you generate them for your
          applications (they&apos;re written to <code className="font-mono text-xs">output/</code>).
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company, role, filename…"
            aria-label="Search documents"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="Filter by kind">
            {KIND_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={kind === tab.id}
                onClick={() => setKind(tab.id)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                  kind === tab.id
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger size="sm" aria-label="Sort documents" className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Result summary */}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {visible.length} of {counts.total} document{counts.total === 1 ? "" : "s"}
        {" · "}
        {counts.cv} CV{counts.cv === 1 ? "" : "s"}, {counts.cover} cover letter
        {counts.cover === 1 ? "" : "s"}
      </p>

      {/* List / no-results */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
          <p className="text-sm font-medium">No documents match your search</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different company or role
            {kind !== "all" ? ", or clear the kind filter" : ""}.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setKind("all");
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-3.5" aria-hidden />
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((doc) => (
            <DocRow
              key={doc.path}
              doc={doc}
              dashboardGroup={
                doc.statusId ? dashboardGroupById.get(doc.statusId) ?? null : null
              }
              onPreview={() => setPreview(doc)}
            />
          ))}
        </ul>
      )}

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="h-[85vh] max-w-4xl gap-0 p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="truncate text-sm">
              {preview ? `${preview.company ?? preview.fileName}` : ""}
              {preview?.role ? (
                <span className="font-normal text-muted-foreground">
                  {" — "}
                  {preview.role}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          {preview ? (
            <iframe
              key={preview.fileName}
              src={docUrl(preview.fileName)}
              title={preview.fileName}
              className="h-full w-full flex-1 rounded-b-lg bg-white"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocRow({
  doc,
  dashboardGroup,
  onPreview,
}: {
  doc: GeneratedDocument;
  dashboardGroup: CanonicalState["dashboardGroup"] | null;
  onPreview: () => void;
}) {
  const isCv = doc.kind === "cv";
  const Icon = isCv ? FileText : Mail;
  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30">
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md",
          isCv ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {doc.appNum != null ? (
            <Link
              href={`/app/${doc.appNum}`}
              className="min-w-0 truncate text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              {doc.company ?? doc.fileName}
            </Link>
          ) : (
            <span className="min-w-0 truncate text-sm font-medium">
              {doc.company ?? doc.fileName}
            </span>
          )}
          <Badge variant={isCv ? "secondary" : "outline"} className="shrink-0 font-normal">
            {isCv ? "CV" : "Cover letter"}
          </Badge>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {doc.role ? <span className="truncate">{doc.role}</span> : null}
          {doc.role ? <span aria-hidden>·</span> : null}
          <span>{formatDate(doc.generatedDate)}</span>
          <span aria-hidden>·</span>
          <span>{formatSize(doc.sizeBytes)}</span>
          {doc.statusLabel ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    (dashboardGroup && STATUS_DOT_CLASS[dashboardGroup]) ??
                      "bg-muted-foreground/40",
                  )}
                />
                {doc.statusLabel}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onPreview}
          aria-label={`Preview ${doc.fileName}`}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Eye className="size-4" aria-hidden />
        </button>
        <a
          href={docUrl(doc.fileName)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${doc.fileName}`}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Download className="size-4" aria-hidden />
        </a>
      </div>
    </li>
  );
}
