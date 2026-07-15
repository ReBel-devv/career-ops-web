"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMutationsEnabled } from "@/components/providers/app-providers";
import { useProfileActions } from "@/lib/client/queries";
import type { EditableProfileField } from "@/lib/domain";
import { cn } from "@/lib/utils";

interface EditableFieldProps {
  label: string;
  /** The on-disk YAML path this field writes to. */
  field: EditableProfileField;
  value: string | null;
  /** Render the value over several lines with a textarea editor. */
  multiline?: boolean;
  type?: "text" | "email" | "tel" | "url";
  placeholder?: string;
  /** Build an href to render the display value as a link (contact fields). */
  href?: (value: string) => string;
  /** Hide the small field label (e.g. the hero name/headline). */
  hideLabel?: boolean;
  /** Extra classes for the displayed value — lets the hero render it large. */
  valueClassName?: string;
}

/**
 * One inline-editable scalar profile field. Read mode shows the label + value
 * (a muted "Not set" when empty); clicking Edit swaps in an input/textarea with
 * Save/Cancel. Saving PATCHes exactly this YAML field with optimistic
 * concurrency (the value we loaded is sent as `expected`). Disabled entirely in
 * read-only mode — the value still renders, just not the editor.
 */
export function EditableField({
  label,
  field,
  value,
  multiline = false,
  type = "text",
  placeholder,
  href,
  hideLabel = false,
  valueClassName,
}: EditableFieldProps) {
  const enabled = useMutationsEnabled();
  const { updateField } = useProfileActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const current = value ?? "";

  function startEditing() {
    setDraft(current);
    setEditing(true);
  }

  // Focus the editor once it mounts (a DOM side-effect, not state sync).
  useEffect(() => {
    if (!editing) return undefined;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [editing]);

  async function save() {
    const next = draft.trim();
    if (next === current.trim()) {
      setEditing(false);
      return;
    }
    try {
      await updateField.mutateAsync({ field, value: next, expected: current });
      setEditing(false);
      toast.success(`${label} updated`);
    } catch (error) {
      toast.error(`Couldn't update ${label.toLowerCase()}`, {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void save();
    }
  }

  if (editing) {
    const pending = updateField.isPending;
    return (
      <div className="flex flex-col gap-1.5">
        {!hideLabel ? (
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        ) : null}
        <div className="flex items-start gap-2">
          {multiline ? (
            <Textarea
              ref={inputRef as React.Ref<HTMLTextAreaElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              rows={3}
              className="min-h-20 flex-1"
              disabled={pending}
            />
          ) : (
            <Input
              ref={inputRef as React.Ref<HTMLInputElement>}
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="flex-1"
              disabled={pending}
            />
          )}
          <div className="flex shrink-0 gap-1 pt-0.5">
            <button
              type="button"
              onClick={() => void save()}
              disabled={pending}
              aria-label="Save"
              className="flex size-8 items-center justify-center rounded-md border bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Check className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={pending}
              aria-label="Cancel"
              className="flex size-8 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        {multiline ? (
          <span className="text-[11px] text-muted-foreground">
            ⌘/Ctrl + Enter to save · Esc to cancel
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="group flex flex-col gap-0.5">
      {!hideLabel ? (
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "min-w-0 text-sm",
            multiline && "whitespace-pre-wrap",
            valueClassName,
          )}
        >
          {current ? (
            href ? (
              <a
                href={href(current)}
                target="_blank"
                rel="noreferrer"
                className="break-words text-primary underline-offset-2 hover:underline"
              >
                {current}
              </a>
            ) : (
              <span className="break-words">{current}</span>
            )
          ) : (
            <span className="text-muted-foreground italic">Not set</span>
          )}
        </div>
        {enabled ? (
          <button
            type="button"
            onClick={startEditing}
            aria-label={`Edit ${label.toLowerCase()}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover:opacity-100"
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
