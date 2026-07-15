"use client";

import { useRef, useState } from "react";
import {
  Download,
  Eye,
  FileText,
  FileType2,
  Info,
  Paperclip,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useClientConfig,
  useMutationsEnabled,
} from "@/components/providers/app-providers";
import { useProfileActions } from "@/lib/client/queries";
import { PROFILE_UPLOAD_EXTS, type ProfileDocument } from "@/lib/domain";
import { cn } from "@/lib/utils";

const ACCEPT = PROFILE_UPLOAD_EXTS.map((e) => `.${e}`).join(",");

/** Bytes → a short human size (e.g. "482 KB", "1.2 MB"). */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function docUrl(name: string): string {
  return `/api/profile/documents/${encodeURIComponent(name)}`;
}

function DocIcon({ kind }: { kind: ProfileDocument["kind"] }) {
  if (kind === "pdf") return <FileType2 className="size-5" aria-hidden />;
  if (kind === "markdown" || kind === "text")
    return <FileText className="size-5" aria-hidden />;
  return <Paperclip className="size-5" aria-hidden />;
}

/**
 * Source documents that feed the profile (`sources/`): internship reports,
 * project references, etc. Lists what's on disk, previews PDFs and text inline,
 * and uploads new files (drag-and-drop or picker). Uploads are disabled in
 * read-only mode; previews are unavailable in demo mode (no real bytes).
 */
export function ProfileDocuments({ documents }: { documents: ProfileDocument[] }) {
  const enabled = useMutationsEnabled();
  const { demoMode } = useClientConfig();
  const { addDocument } = useProfileActions();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ProfileDocument | null>(null);

  function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) addDocument.mutate(file);
  }

  const canPreview = (d: ProfileDocument) =>
    !demoMode && (d.kind === "pdf" || d.kind === "text" || d.kind === "markdown");

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Documents</h2>
          <p className="text-sm text-muted-foreground">
            Private source files that feed your profile (internship reports,
            references…).
          </p>
        </div>
        {enabled ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={addDocument.isPending}
          >
            <Upload className="size-4" aria-hidden />
            {addDocument.isPending ? "Uploading…" : "Upload"}
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {enabled ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files);
          }}
          className={cn(
            "rounded-lg border border-dashed px-4 py-3 text-center text-sm text-muted-foreground transition-colors",
            dragging && "border-primary bg-primary/5 text-foreground",
          )}
        >
          Drag & drop files here, or use Upload.{" "}
          <span className="text-xs">
            Accepted: {PROFILE_UPLOAD_EXTS.join(", ")}
          </span>
        </div>
      ) : null}

      {documents.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No source documents yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {documents.map((doc) => (
            <li
              key={doc.name}
              className="flex items-center gap-3 rounded-lg border bg-card p-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <DocIcon kind={doc.kind} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={doc.name}>
                  {doc.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {doc.ext.toUpperCase()} · {formatSize(doc.sizeBytes)} ·{" "}
                  {formatDate(doc.modifiedMs)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canPreview(doc) ? (
                  <button
                    type="button"
                    onClick={() => setPreview(doc)}
                    aria-label={`Preview ${doc.name}`}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Eye className="size-4" aria-hidden />
                  </button>
                ) : null}
                {!demoMode ? (
                  <a
                    href={docUrl(doc.name)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${doc.name}`}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Download className="size-4" aria-hidden />
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {demoMode && documents.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="size-3.5" aria-hidden />
          Document previews and downloads are disabled in demo mode.
        </p>
      ) : null}

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="h-[85vh] max-w-4xl gap-0 p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="truncate text-sm">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview ? (
            <iframe
              key={preview.name}
              src={docUrl(preview.name)}
              title={preview.name}
              className="h-full w-full flex-1 rounded-b-lg bg-white"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
