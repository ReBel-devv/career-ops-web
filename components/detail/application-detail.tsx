"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { ScoreBadge } from "@/components/data/score-badge";
import { StatusIndicator } from "@/components/data/status-indicator";
import { StatusSelect } from "@/components/applications/status-select";
import { OutreachPanel } from "@/components/outreach/outreach-panel";
import { ReportMarkdown } from "@/components/report/report-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useMutationsEnabled } from "@/components/providers/app-providers";
import {
  useApplicationActions,
  useApplications,
  useDocuments,
  useFollowUpCadence,
  useFollowUps,
  useInterviewPrep,
  useReport,
  useStates,
} from "@/lib/client/queries";
import { sanitizeNotes } from "@/lib/notes";
import type {
  Application,
  CadenceEntry,
  CanonicalState,
  Document,
  FollowUpData,
  FollowUpLog,
  FollowUpPin,
  MachineSummary,
  Report,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

/** Status ids that mean the application has actually been submitted. */
const APPLIED_IDS = new Set(["applied", "responded", "interview", "offer"]);

/**
 * The full application detail — every zone from plan §2. Rendered both as a
 * full page (mobile / deep-link) and inside the desktop drawer (Sheet). All
 * report-derived zones degrade gracefully: a row with no report shows only the
 * header, timeline and notes; a report with no Machine Summary shows an honest
 * fallback (F2 AC).
 */
export function ApplicationDetail({ num }: { num: number }) {
  const appsQuery = useApplications();
  const statesQuery = useStates();
  const reportQuery = useReport(num);
  const documentsQuery = useDocuments(num);
  const followUpsQuery = useFollowUps();
  const cadenceQuery = useFollowUpCadence();
  const mutationsEnabled = useMutationsEnabled();

  const app = appsQuery.data?.find((a) => a.num === num) ?? null;

  if (appsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!app) {
    return (
      <div
        role="alert"
        className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
      >
        <p className="font-medium">
          Application #{String(num).padStart(3, "0")} not found
        </p>
        <p className="mt-1 text-muted-foreground">
          No row with this number exists in the tracker.
        </p>
      </div>
    );
  }

  const report = reportQuery.data ?? null;
  const states = statesQuery.data ?? [];
  const editable = mutationsEnabled && states.length > 0;

  return (
    <article className="flex flex-col gap-6">
      <DetailHeader app={app} report={report} states={states} editable={editable} />

      {reportQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : report ? (
        <>
          <MachineSummaryPanel summary={report.machineSummary} />
          <ScoreTable report={report} />
        </>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No evaluation report is linked to this application.
        </p>
      )}

      <DocumentsZone
        documents={documentsQuery.data ?? []}
        loading={documentsQuery.isLoading}
      />

      <Timeline
        app={app}
        report={report}
        followUps={followUpsQuery.data}
        cadenceEntry={cadenceQuery.data?.entries.find((e) => e.num === num) ?? null}
      />

      <NotesEditor app={app} editable={editable} />

      <OutreachPanel num={num} />

      <InterviewPrepCard num={num} status={app.statusId} />

      {report ? <FullReport report={report} /> : null}
    </article>
  );
}

/* ---------------------------------------------------------------- Header --- */

function DetailHeader({
  app,
  report,
  states,
  editable,
}: {
  app: Application;
  report: Report | null;
  states: CanonicalState[];
  editable: boolean;
}) {
  const legitimacy =
    report?.header.legitimacy ?? report?.machineSummary?.legitimacy_tier ?? null;
  const archetype =
    report?.machineSummary?.archetype ?? report?.header.archetype ?? null;
  const url = report?.header.url ?? null;

  return (
    <header className="flex flex-col gap-3">
      <div className="font-mono text-xs tabular-nums text-muted-foreground">
        #{String(app.num).padStart(3, "0")}
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{app.company}</h1>
        <p className="mt-0.5 text-muted-foreground">{app.role}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ScoreBadge raw={app.scoreRaw} score={app.score} />
        {editable ? (
          <StatusSelect app={app} states={states} />
        ) : (
          <StatusIndicator
            group={app.dashboardGroup}
            label={app.statusLabel ?? app.statusRaw}
          />
        )}
        {legitimacy ? (
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="size-3" aria-hidden />
            {legitimacy}
          </Badge>
        ) : null}
        {archetype ? (
          <Badge variant="secondary" title="Detected archetype">
            {archetype}
          </Badge>
        ) : null}
      </div>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          View job posting
        </a>
      ) : null}
    </header>
  );
}

/* ------------------------------------------------------- Machine Summary --- */

function MachineSummaryPanel({ summary }: { summary: MachineSummary | null }) {
  if (!summary) {
    return (
      <Section title="Machine summary">
        <p className="text-sm text-muted-foreground">
          No machine summary in this report.
        </p>
      </Section>
    );
  }

  return (
    <Section title="Machine summary">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {summary.final_decision ? (
            <Badge
              variant="default"
              className="h-auto max-w-full whitespace-normal text-left"
            >
              {summary.final_decision}
            </Badge>
          ) : null}
          {summary.risk_level ? (
            <Badge variant="outline">Risk: {summary.risk_level}</Badge>
          ) : null}
          {summary.confidence ? (
            <Badge variant="outline">Confidence: {summary.confidence}</Badge>
          ) : null}
        </div>

        {summary.top_strengths.length > 0 ? (
          <ChipList
            icon={<Sparkles className="size-3.5 text-score-high" aria-hidden />}
            label="Strengths"
            items={summary.top_strengths}
            tone="high"
          />
        ) : null}
        {summary.soft_gaps.length > 0 ? (
          <ChipList
            icon={<TriangleAlert className="size-3.5 text-score-mid" aria-hidden />}
            label="Soft gaps"
            items={summary.soft_gaps}
            tone="mid"
          />
        ) : null}
        {summary.hard_stops.length > 0 ? (
          <ChipList
            icon={<AlertTriangle className="size-3.5 text-score-low" aria-hidden />}
            label="Hard stops"
            items={summary.hard_stops}
            tone="low"
          />
        ) : null}

        {summary.next_action ? (
          <p className="text-sm">
            <span className="font-medium">Next action: </span>
            <span className="text-muted-foreground">{summary.next_action}</span>
          </p>
        ) : null}
        {summary.location || summary.comp ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            {summary.location ? <span>Location: {summary.location}</span> : null}
            {summary.comp ? <span>Comp: {summary.comp}</span> : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function ChipList({
  icon,
  label,
  items,
  tone,
}: {
  icon: ReactNode;
  label: string;
  items: string[];
  tone: "high" | "mid" | "low";
}) {
  const dotTone = {
    high: "bg-score-high",
    mid: "bg-score-mid",
    low: "bg-score-low",
  }[tone];
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-snug">
            <span
              aria-hidden
              className={cn("mt-[0.4rem] size-1.5 shrink-0 rounded-full", dotTone)}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------- Score table --- */

function ScoreTable({ report }: { report: Report }) {
  const sg = report.scoreGlobal;
  if (!sg || (sg.rows.length === 0 && !sg.global)) return null;
  return (
    <Section title="Score breakdown">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-data">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">Dimension</th>
              <th className="w-20 px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Comment</th>
            </tr>
          </thead>
          <tbody>
            {sg.rows.map((row, i) => (
              <tr key={i} className="border-b last:border-b-0">
                <td className="px-3 py-2 align-top">{row.dimension}</td>
                <td className="px-3 py-2 align-top font-mono tabular-nums">
                  {row.score}
                </td>
                <td className="px-3 py-2 align-top text-muted-foreground">
                  {row.comment}
                </td>
              </tr>
            ))}
            {sg.global ? (
              <tr className="bg-muted/40 font-medium">
                <td className="px-3 py-2 align-top">{sg.global.dimension}</td>
                <td className="px-3 py-2 align-top font-mono tabular-nums">
                  {sg.global.score}
                </td>
                <td className="px-3 py-2 align-top">{sg.global.comment}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------- Documents --- */

function DocumentsZone({
  documents,
  loading,
}: {
  documents: Document[];
  loading: boolean;
}) {
  return (
    <Section title="Documents">
      {loading ? (
        <Skeleton className="h-10 w-full" />
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No document found.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((doc) => (
            <li key={doc.fileName}>
              <a
                href={`/api/files/pdf/${encodeURIComponent(doc.fileName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="shrink-0 font-medium">
                  {doc.kind === "cv" ? "CV" : "Cover letter"}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {doc.fileName}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ Timeline --- */

function Timeline({
  app,
  report,
  followUps,
  cadenceEntry,
}: {
  app: Application;
  report: Report | null;
  followUps: FollowUpData | undefined;
  cadenceEntry: CadenceEntry | null;
}) {
  const evaluatedDate = report?.header.date ?? dateFromReportPath(report?.path);
  const isApplied = app.statusId !== null && APPLIED_IDS.has(app.statusId);

  // Last-wins pin for this app + its logged follow-ups, sorted by date.
  const { pin, logs } = useMemo((): {
    pin: FollowUpPin | null;
    logs: FollowUpLog[];
  } => {
    if (!followUps) return { pin: null, logs: [] };
    let latest: FollowUpPin | null = null;
    for (const p of followUps.pins) if (p.appNum === app.num) latest = p;
    const logsForApp = followUps.logs
      .filter((l) => l.appNum === app.num)
      .sort((a, b) => a.date.localeCompare(b.date));
    return { pin: latest, logs: logsForApp };
  }, [followUps, app.num]);

  return (
    <Section title="Timeline">
      {cadenceEntry && cadenceEntry.nextFollowupDate ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm",
            (cadenceEntry.urgency === "overdue" ||
              cadenceEntry.urgency === "urgent") &&
              "bg-score-low/5",
          )}
        >
          <CalendarClock
            className={cn(
              "size-3.5 shrink-0",
              cadenceEntry.urgency === "overdue" || cadenceEntry.urgency === "urgent"
                ? "text-score-low"
                : "text-primary",
            )}
            aria-hidden
          />
          <span className="font-medium">Next action:</span>
          <span className="text-muted-foreground">
            follow up{" "}
            <span className="font-mono tabular-nums">{cadenceEntry.nextFollowupDate}</span>
            {cadenceEntry.daysUntilNext !== null
              ? cadenceEntry.daysUntilNext === 0
                ? " (due today)"
                : cadenceEntry.daysUntilNext < 0
                  ? ` (${Math.abs(cadenceEntry.daysUntilNext)}d overdue)`
                  : ` (in ${cadenceEntry.daysUntilNext}d)`
              : null}
          </span>
        </div>
      ) : null}
      <ol className="flex flex-col gap-2.5 text-sm">
        {evaluatedDate ? <TimelineRow date={evaluatedDate} label="Evaluated" /> : null}
        {/* Decision 4: the tracker Date column IS the applied date once Applied. */}
        <TimelineRow date={app.date} label={isApplied ? "Applied" : "Tracker date"} />
        {logs.map((log) => (
          <TimelineRow
            key={`${log.num}-${log.date}`}
            date={log.date}
            label={`Follow-up${log.channel ? ` · ${log.channel}` : ""}`}
            note={log.notes || undefined}
          />
        ))}
        {pin ? (
          <li className="flex items-baseline gap-2">
            <CalendarClock
              className="size-3.5 shrink-0 translate-y-0.5 text-primary"
              aria-hidden
            />
            <span className="font-mono tabular-nums text-muted-foreground">
              {pin.date}
            </span>
            <span>
              Next follow-up{" "}
              <span className="text-muted-foreground">(set {pin.setDate})</span>
            </span>
          </li>
        ) : null}
      </ol>
    </Section>
  );
}

function TimelineRow({
  date,
  label,
  note,
}: {
  date: string;
  label: string;
  note?: string;
}) {
  return (
    <li className="flex items-baseline gap-2">
      <span
        className="size-1.5 shrink-0 translate-y-1.5 rounded-full bg-muted-foreground/50"
        aria-hidden
      />
      <span className="font-mono tabular-nums text-muted-foreground">{date}</span>
      <span>
        {label}
        {note ? <span className="text-muted-foreground"> — {note}</span> : null}
      </span>
    </li>
  );
}

function dateFromReportPath(path?: string): string | null {
  if (!path) return null;
  const m = /(\d{4}-\d{2}-\d{2})\.md$/.exec(path);
  return m ? m[1] : null;
}

/* --------------------------------------------------------- Notes editor --- */

function NotesEditor({ app, editable }: { app: Application; editable: boolean }) {
  const { saveNotes, isPending } = useApplicationActions();
  const [value, setValue] = useState(app.notes);

  // Re-sync when the underlying row changes (server round-trip / undo) —
  // "adjust state during render" pattern, no effect needed.
  const [lastRowNotes, setLastRowNotes] = useState(app.notes);
  if (app.notes !== lastRowNotes) {
    setLastRowNotes(app.notes);
    setValue(app.notes);
  }

  // Exact-cell preview: same pure sanitizer the server writer uses (risk 5).
  const preview = sanitizeNotes(value);
  const willSanitize = preview !== value.trim();
  const dirty = value !== app.notes;

  if (!editable) {
    return (
      <Section title="Notes">
        {app.notes.trim() === "" ? (
          <p className="text-sm text-muted-foreground">No notes.</p>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{app.notes}</p>
        )}
      </Section>
    );
  }

  return (
    <Section title="Notes">
      <div className="flex flex-col gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          aria-label={`Notes for #${app.num}`}
          placeholder="Add a note…"
        />
        {willSanitize ? (
          <p className="text-xs text-muted-foreground">
            Saved to the tracker as:{" "}
            <span className="font-mono text-foreground">{preview || "(empty)"}</span>
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={!dirty || isPending}
            onClick={() => saveNotes(app, value)}
          >
            Save notes
          </Button>
          {dirty ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => setValue(app.notes)}
            >
              Reset
            </Button>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------- Interview prep --- */

/**
 * Surfaces the company-specific `interview-prep/{company}-{role}.md` notes the
 * career-ops interview modes generate. Shown whenever a prep file matches this
 * application (any status — an Applied row can already have prep), plus an
 * honest empty state while the row is in the interview stage. Non-interview
 * rows with no file render nothing (no empty section noise).
 */
function InterviewPrepCard({ num, status }: { num: number; status: string | null }) {
  const query = useInterviewPrep(num);
  const files = query.data ?? [];
  const isInterview = status === "interview";

  if (query.isLoading) {
    if (!isInterview) return null;
    return (
      <Section title="Interview prep">
        <Skeleton className="h-10 w-full" />
      </Section>
    );
  }

  if (files.length === 0) {
    if (!isInterview) return null;
    return (
      <Section title="Interview prep">
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No interview-prep file yet. Generate one with the career-ops{" "}
          <code className="font-mono text-foreground">interview</code> modes and it
          will appear here.
        </div>
      </Section>
    );
  }

  return (
    <Section title="Interview prep">
      <Accordion type="multiple" className="rounded-md border px-3">
        {files.map((file, i) => (
          <AccordionItem key={file.fileName} value={`prep-${i}`}>
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-mono text-xs">{file.fileName}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ReportMarkdown markdown={file.markdown} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}

/* --------------------------------------------------------- Full report --- */

function FullReport({ report }: { report: Report }) {
  if (report.blocks.length === 0) {
    // No `## ` sections detected — render the raw markdown as one piece.
    return (
      <Section title="Full report">
        <ReportMarkdown markdown={report.markdown} />
      </Section>
    );
  }
  return (
    <Section title="Full report">
      <Accordion type="multiple" className="rounded-md border px-3">
        {report.blocks.map((block, i) => (
          <AccordionItem key={i} value={`block-${i}`}>
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                {block.letter ? (
                  <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-muted px-1 font-mono text-xs">
                    {block.letter}
                  </span>
                ) : null}
                <span>{stripLetter(block.title)}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ReportMarkdown markdown={stripHeading(block.markdown)} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}

/** `A) Résumé du Rôle` → `Résumé du Rôle` (the letter renders as a chip). */
function stripLetter(title: string): string {
  return title.replace(/^[A-G](?:\s*-\s*[A-G])?\s*\)\s*/, "");
}

/** Drop the leading `## Heading` line so the trigger doesn't duplicate it. */
function stripHeading(markdown: string): string {
  return markdown.replace(/^##\s+.*(\r?\n)?/, "");
}

/* ------------------------------------------------------------- Section --- */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
