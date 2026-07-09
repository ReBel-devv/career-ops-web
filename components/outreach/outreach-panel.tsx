"use client";

import { useState } from "react";
import { ExternalLink, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useMutationsEnabled } from "@/components/providers/app-providers";
import { useOutreach, useOutreachActions } from "@/lib/client/queries";
import { KIND_LABELS, STAGE_LABELS, stageIndex } from "@/lib/outreach-view";
import {
  OUTREACH_CONTACT_KINDS,
  OUTREACH_STAGES,
  type OutreachContact,
  type OutreachContactKind,
  type OutreachStage,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * LinkedIn outreach panel (F7) — detail zone 8. Per-contact stage stepper over
 * the linear machine identified → requested → accepted → messaged → replied.
 * Stage moves are unrestricted (skips + regressions allowed) and get an undo
 * toast (M2 pattern). Data lives in the user-layer `data/outreach.yml`.
 */
export function OutreachPanel({ num }: { num: number }) {
  const outreachQuery = useOutreach();
  const actions = useOutreachActions();
  const enabled = useMutationsEnabled();
  const [addOpen, setAddOpen] = useState(false);

  const contacts =
    outreachQuery.data?.find((r) => r.appNum === num)?.contacts ?? [];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">
          Outreach
        </h2>
        {enabled ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-11 gap-1.5 px-2.5 text-xs"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-3.5" aria-hidden />
            Add contact
          </Button>
        ) : null}
      </div>

      {outreachQuery.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : outreachQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load outreach data
          {outreachQuery.error instanceof Error
            ? ` — ${outreachQuery.error.message}`
            : ""}
          .
        </p>
      ) : contacts.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No contacts tracked yet. Add the recruiter, hiring manager, or a team
          peer to track your LinkedIn outreach for this application.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {contacts.map((contact) => (
            <ContactRow
              key={contact.id}
              num={num}
              contact={contact}
              enabled={enabled}
              onSetStage={(stage) => actions.setStage(num, contact, stage)}
              onRemove={() => actions.removeContact(num, contact.id)}
              isPending={actions.isPending}
            />
          ))}
        </ul>
      )}

      <ContactDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add contact"
        description="Track a new outreach contact for this application."
        submitLabel="Add contact"
        onSubmit={(values) => {
          actions.addContact(num, values);
          setAddOpen(false);
        }}
      />
    </section>
  );
}

/* ------------------------------------------------------------ Contact row --- */

function ContactRow({
  num,
  contact,
  enabled,
  onSetStage,
  onRemove,
  isPending,
}: {
  num: number;
  contact: OutreachContact;
  enabled: boolean;
  onSetStage: (stage: OutreachStage) => void;
  onRemove: () => void;
  isPending: boolean;
}) {
  const actions = useOutreachActions();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
              {contact.name}
            </span>
            <Badge variant="secondary">
              {KIND_LABELS[contact.kind] ?? contact.kind}
            </Badge>
            {contact.linkedin ? (
              <a
                href={contact.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden />
                LinkedIn
              </a>
            ) : null}
          </div>
          {contact.companyRole ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {contact.companyRole}
            </p>
          ) : null}
        </div>
        {enabled ? (
          <Button
            variant="ghost"
            size="sm"
            className="size-11 shrink-0 p-0 text-muted-foreground"
            aria-label={`Edit contact ${contact.name}`}
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>

      <StageStepper
        contact={contact}
        disabled={!enabled || isPending}
        onSetStage={onSetStage}
      />

      {contact.notes ? (
        <p className="text-xs leading-snug text-muted-foreground">{contact.notes}</p>
      ) : null}

      <ContactDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit contact"
        description={`${contact.name} — #${String(num).padStart(3, "0")}`}
        submitLabel="Save changes"
        initial={contact}
        onSubmit={(values) => {
          actions.editContact(num, contact.id, {
            kind: values.kind,
            name: values.name,
            linkedin: values.linkedin ?? null,
            companyRole: values.companyRole ?? null,
            notes: values.notes ?? null,
          });
          setEditOpen(false);
        }}
        onRemove={() => {
          onRemove();
          setEditOpen(false);
        }}
      />
    </li>
  );
}

/* ---------------------------------------------------------- Stage stepper --- */

/**
 * Keyboard-operable stepper: one native button per stage (Tab + Enter/Space),
 * ≥44px touch targets. Reached stages (those with a stamped date) show a filled
 * dot + their date in mono; the CURRENT stage is accented. Clicking any stage
 * sets it — forward, skipping, or back (no illegal-move blocking).
 */
function StageStepper({
  contact,
  disabled,
  onSetStage,
}: {
  contact: OutreachContact;
  disabled: boolean;
  onSetStage: (stage: OutreachStage) => void;
}) {
  const currentIdx = stageIndex(contact.stage);
  return (
    <ol
      aria-label={`Outreach stage for ${contact.name}: ${STAGE_LABELS[contact.stage]}`}
      className="flex items-start overflow-x-auto pb-1"
    >
      {OUTREACH_STAGES.map((stage, i) => {
        const date = contact.stageDates[stage];
        const isCurrent = stage === contact.stage;
        const reached = date !== undefined;
        return (
          <li key={stage} className="flex min-w-0 flex-1 flex-col items-stretch">
            <div className="flex items-center">
              <span
                aria-hidden
                className={cn(
                  "h-px flex-1",
                  i === 0 ? "bg-transparent" : i <= currentIdx ? "bg-primary/50" : "bg-border",
                )}
              />
              <button
                type="button"
                disabled={disabled}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={
                  isCurrent
                    ? `${STAGE_LABELS[stage]} (current stage)`
                    : `Set stage to ${STAGE_LABELS[stage]}`
                }
                title={date ? `${STAGE_LABELS[stage]} — ${date}` : STAGE_LABELS[stage]}
                onClick={() => onSetStage(stage)}
                className={cn(
                  "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-md px-1",
                  "focus-visible:outline-2 focus-visible:outline-ring",
                  !disabled && "hover:bg-accent/60",
                  disabled && "cursor-default",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 rounded-full border",
                    isCurrent
                      ? "border-primary bg-primary ring-2 ring-primary/30"
                      : reached
                        ? "border-primary/60 bg-primary/60"
                        : "border-muted-foreground/40 bg-transparent",
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] leading-none",
                    isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {STAGE_LABELS[stage]}
                </span>
              </button>
              <span
                aria-hidden
                className={cn(
                  "h-px flex-1",
                  i === OUTREACH_STAGES.length - 1
                    ? "bg-transparent"
                    : i < currentIdx
                      ? "bg-primary/50"
                      : "bg-border",
                )}
              />
            </div>
            <span
              className={cn(
                "mt-0.5 text-center font-mono text-[10px] tabular-nums",
                date ? "text-muted-foreground" : "text-transparent",
              )}
            >
              {date ?? "—"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------- Add/Edit dialog --- */

interface ContactFormValues {
  kind: OutreachContactKind;
  name: string;
  linkedin?: string;
  companyRole?: string;
  notes?: string;
}

function ContactDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initial,
  onSubmit,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  initial?: OutreachContact;
  onSubmit: (values: ContactFormValues) => void;
  onRemove?: () => void;
}) {
  const [kind, setKind] = useState<OutreachContactKind>(initial?.kind ?? "recruiter");
  const [name, setName] = useState(initial?.name ?? "");
  const [linkedin, setLinkedin] = useState(initial?.linkedin ?? "");
  const [companyRole, setCompanyRole] = useState(initial?.companyRole ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // Re-sync the form when the dialog opens on fresh data (render-time adjust).
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setKind(initial?.kind ?? "recruiter");
      setName(initial?.name ?? "");
      setLinkedin(initial?.linkedin ?? "");
      setCompanyRole(initial?.companyRole ?? "");
      setNotes(initial?.notes ?? "");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label="Kind">
            <Select value={kind} onValueChange={(v) => setKind(v as OutreachContactKind)}>
              <SelectTrigger className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTREACH_CONTACT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABELS[k] ?? k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
            />
          </Field>
          <Field label="LinkedIn URL (optional)">
            <Input
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              placeholder="https://www.linkedin.com/in/…"
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Role at the company (optional)">
            <Input
              value={companyRole}
              onChange={(e) => setCompanyRole(e.target.value)}
              placeholder="Engineering Manager"
            />
          </Field>
          <Field label="Notes (optional)">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="How you found them, intro angle…"
            />
          </Field>
          <div className="flex items-center justify-between gap-2">
            {onRemove ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-11 gap-1.5 text-destructive hover:text-destructive"
                onClick={onRemove}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-11"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-11"
                disabled={name.trim() === ""}
                onClick={() =>
                  onSubmit({
                    kind,
                    name: name.trim(),
                    linkedin: linkedin.trim() || undefined,
                    companyRole: companyRole.trim() || undefined,
                    notes: notes.trim() || undefined,
                  })
                }
              >
                {submitLabel}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
