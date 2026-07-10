import {
  applicationSchema,
  patternsSchema,
  scanRecordSchema,
  statesFileSchema,
  type AddOutreachContactInput,
  type Application,
  type CanonicalState,
  type CadenceEntry,
  type DeleteOutreachContactInput,
  type Document,
  type FollowUpCadence,
  type FollowUpData,
  type FollowUpLog,
  type FollowUpUrgency,
  type FollowUpWriteResult,
  type LogFollowUpInput,
  type OutreachDoc,
  type OutreachMutationResult,
  type OutreachRecord,
  type PatternsResult,
  type PipelineItem,
  type Report,
  type ReportFacet,
  type RescheduleFollowUpInput,
  type ScanRecord,
  type UpdateApplicationInput,
  type UpdateApplicationResult,
  type UpdateOutreachContactInput,
} from "@/lib/domain";
import {
  applyAddContact,
  applyDeleteContact,
  applyUpdateContact,
  FollowUpWriteError,
  OutreachWriteError,
  resolveWritableStatus,
  sanitizeNotes,
  TrackerWriteError,
} from "@/lib/writers";
import { parsePipeline } from "@/lib/parsers/pipeline";
import { parseReport, reportFacet } from "@/lib/parsers/report";
import { DEMO_APPS } from "@/fixtures/apps";
import { DEMO_REPORTS } from "@/fixtures/reports";
import { DEMO_CADENCE_CONFIG, DEMO_FOLLOW_UP_SEEDS } from "@/fixtures/follow-ups";
import { buildDemoOutreach } from "@/fixtures/outreach";
import { DEMO_PIPELINE_MD, DEMO_SCAN_HISTORY } from "@/fixtures/discovery";
import { DEMO_DOCUMENTS } from "@/fixtures/pdfs";
import { buildDemoPatterns } from "@/fixtures/patterns";
import type { DataSource } from "./data-source";

/**
 * Fixture-backed DataSource used when DEMO_MODE=true (plan §7). Never touches
 * the filesystem. The full fictional dataset lives in `fixtures/` — ~30
 * invented applications across all 8 states, 8 full English reports (parsed by
 * the REAL report parser), dynamic-offset follow-ups, seeded outreach, a
 * pipeline inbox (parsed by the REAL pipeline parser), scanner history, and
 * generated placeholder PDFs. Analytics are DERIVED from the fixtures with the
 * same outcome/channel math as the real code paths (fixtures/patterns.ts).
 *
 * Writes (Decision 6): fully interactive, in-memory only — module-level state
 * that resets on server restart (and on serverless instance recycle in the
 * public demo). Demo mutations reuse the SAME validation + pure mutation
 * functions as FS mode, so the two modes never drift.
 */

/** Mirrors the 8 canonical states of templates/states.yml (demo has no repo). */
const DEMO_STATES_FILE = {
  states: [
    { id: "evaluated", label: "Evaluated", aliases: [], description: "Offer evaluated with report, pending decision", dashboard_group: "evaluated" },
    { id: "applied", label: "Applied", aliases: ["sent"], description: "Application submitted", dashboard_group: "applied" },
    { id: "responded", label: "Responded", aliases: [], description: "Company has responded (not yet interview)", dashboard_group: "responded" },
    { id: "interview", label: "Interview", aliases: [], description: "Active interview process", dashboard_group: "interview" },
    { id: "offer", label: "Offer", aliases: [], description: "Offer received", dashboard_group: "offer" },
    { id: "rejected", label: "Rejected", aliases: [], description: "Rejected by company", dashboard_group: "rejected" },
    { id: "discarded", label: "Discarded", aliases: [], description: "Discarded by candidate or offer closed", dashboard_group: "discarded" },
    { id: "skip", label: "SKIP", aliases: ["monitor"], description: "Doesn't fit, don't apply", dashboard_group: "skip" },
  ],
};

/* ------------------------------------------------- in-memory demo state --- */

/** Status/notes overrides keyed by app num (Decision 6 — never touches a file). */
const demoOverrides = new Map<number, { statusId?: string; notes?: string }>();

/** Session pins (reschedules) + session follow-up logs, layered over the
 * dynamic fixture seeds. */
const demoPins = new Map<number, { date: string; setDate: string }>();
const demoSessionLogs: FollowUpLog[] = [];

/** In-memory outreach document, seeded from fixtures. Mutated through the SAME
 * pure apply* functions the FS writer uses. */
let demoOutreach: OutreachDoc = buildDemoOutreach();

const DEMO_ACTIONABLE_IDS = new Set(["applied", "responded", "interview"]);
const APPLIED_FIRST = DEMO_CADENCE_CONFIG.applied_first;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenISO(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.floor((b - a) / 86_400_000);
}

/** Seeded follow-up log rows with DYNAMIC dates (offsets from today). */
function seededLogs(): FollowUpLog[] {
  const today = todayISO();
  const appsByNum = new Map(DEMO_APPS.map((a) => [a.num, a]));
  const logs: FollowUpLog[] = [];
  for (const seed of DEMO_FOLLOW_UP_SEEDS) {
    const app = appsByNum.get(seed.appNum);
    if (!app || !seed.loggedDaysAgo?.length) continue;
    for (const daysAgo of seed.loggedDaysAgo) {
      logs.push({
        num: logs.length + 1,
        appNum: seed.appNum,
        date: addDaysISO(today, -daysAgo),
        company: app.company,
        role: app.role,
        channel: "email",
        contact: "",
        notes: "Polite nudge with the portfolio link.",
      });
    }
  }
  return logs;
}

export class DemoDataSource implements DataSource {
  async getStates(): Promise<CanonicalState[]> {
    return statesFileSchema.parse(DEMO_STATES_FILE).states;
  }

  async getApplications(): Promise<Application[]> {
    const states = await this.getStates();
    const byId = new Map(states.map((s) => [s.id, s]));
    return DEMO_APPS.map((app) => {
      const override = demoOverrides.get(app.num);
      const statusId = override?.statusId ?? app.statusId;
      const notes = override?.notes ?? app.notes;
      const state = byId.get(statusId) ?? null;
      return applicationSchema.parse({
        num: app.num,
        date: app.date,
        company: app.company,
        role: app.role,
        scoreRaw: app.score === null ? "N/A" : `${app.score.toFixed(1)}/5`,
        score: app.score,
        statusRaw: state?.label ?? statusId,
        statusId: state?.id ?? null,
        statusLabel: state?.label ?? null,
        dashboardGroup: state?.dashboardGroup ?? null,
        hasPdf: app.hasPdf,
        reportPath: app.reportPath,
        notes,
        location: null,
      });
    });
  }

  /** In-memory write — same validation + error codes as FS mode. */
  async updateApplication(
    input: UpdateApplicationInput,
  ): Promise<UpdateApplicationResult> {
    const applications = await this.getApplications();
    const current = applications.find((a) => a.num === input.num);
    if (!current) {
      throw new TrackerWriteError(
        "NOT_FOUND",
        `Application #${input.num} not found in the demo dataset.`,
      );
    }
    if (
      current.company !== input.expected.company ||
      current.role !== input.expected.role
    ) {
      throw new TrackerWriteError(
        "STALE_ROW",
        `Row #${input.num} changed since it was loaded. Reload and retry.`,
      );
    }
    if (input.status === undefined && input.notes === undefined) {
      throw new TrackerWriteError(
        "INVALID_INPUT",
        "Nothing to write: provide status or notes.",
      );
    }

    const states = await this.getStates();
    const previous = demoOverrides.get(input.num) ?? {};
    const next = { ...previous };
    let notesSanitized = false;
    if (input.status !== undefined) {
      next.statusId = resolveWritableStatus(input.status, states).id;
    }
    if (input.notes !== undefined) {
      const clean = sanitizeNotes(input.notes);
      notesSanitized = clean !== input.notes;
      next.notes = clean;
    }
    demoOverrides.set(input.num, next);

    const updated = (await this.getApplications()).find(
      (a) => a.num === input.num,
    );
    if (!updated) {
      throw new TrackerWriteError("NOT_FOUND", "Demo row vanished mid-write.");
    }
    return { application: updated, notesSanitized };
  }

  /* ------------------------------------------------------ Reports (M3) --- */

  /** Parse the fixture report through the REAL parser (one code path). */
  async getReport(num: number): Promise<Report | null> {
    const fixture = DEMO_REPORTS.find((r) => r.num === num);
    if (!fixture) return null;
    return parseReport({
      content: fixture.content,
      path: fixture.path,
      num: fixture.num,
    });
  }

  async getReportFacets(): Promise<ReportFacet[]> {
    return DEMO_REPORTS.map((fixture) =>
      reportFacet(
        parseReport({
          content: fixture.content,
          path: fixture.path,
          num: fixture.num,
        }),
      ),
    );
  }

  async getDocuments(num: number): Promise<Document[]> {
    return DEMO_DOCUMENTS[num] ?? [];
  }

  /* --------------------------------------------------- Follow-ups (M4) --- */

  async getFollowUps(): Promise<FollowUpData> {
    const seeded = seededLogs();
    const offset = seeded.length;
    return {
      logs: [
        ...seeded,
        ...demoSessionLogs.map((l, i) => ({ ...l, num: offset + i + 1 })),
      ],
      pins: [...demoPins.entries()].map(([appNum, p]) => ({
        appNum,
        date: p.date,
        setDate: p.setDate,
      })),
    };
  }

  async getFollowUpCadence(): Promise<FollowUpCadence> {
    const today = todayISO();
    const apps = await this.getApplications();
    const { logs } = await this.getFollowUps();
    const seedByNum = new Map(DEMO_FOLLOW_UP_SEEDS.map((s) => [s.appNum, s]));

    const entries: CadenceEntry[] = apps
      .filter((a) => a.statusId && DEMO_ACTIONABLE_IDS.has(a.statusId))
      .map((a): CadenceEntry => {
        const seed = seedByNum.get(a.num);
        const dueInDays = seed?.dueInDays ?? 5;
        const pin = demoPins.get(a.num);
        const nextFollowupDate = pin?.date ?? addDaysISO(today, dueInDays);
        // Applied date back-derived so the cadence stays internally coherent.
        const appliedDate = addDaysISO(nextFollowupDate, -APPLIED_FIRST);
        const logsForApp = logs.filter((l) => l.appNum === a.num);
        const lastLog = logsForApp[logsForApp.length - 1];
        const daysUntilNext = daysBetweenISO(today, nextFollowupDate);
        const urgency: FollowUpUrgency =
          daysUntilNext < 0 ? "overdue" : daysUntilNext === 0 ? "urgent" : "waiting";
        return {
          num: a.num,
          date: a.date,
          appliedDate,
          company: a.company,
          role: a.role,
          status: a.statusId as string,
          score: a.scoreRaw,
          notes: a.notes,
          reportPath: a.reportPath,
          contacts: [],
          daysSinceApplication: Math.max(daysBetweenISO(appliedDate, today), 0),
          daysSinceLastFollowup: lastLog
            ? Math.max(daysBetweenISO(lastLog.date, today), 0)
            : null,
          followupCount: logsForApp.length,
          urgency,
          nextFollowupDate,
          nextOverride: pin?.date ?? null,
          daysUntilNext,
        };
      });

    const order: Record<FollowUpUrgency, number> = {
      urgent: 0,
      overdue: 1,
      waiting: 2,
      cold: 3,
    };
    entries.sort(
      (x, y) => order[x.urgency] - order[y.urgency] || x.num - y.num,
    );
    return {
      metadata: {
        analysisDate: today,
        totalTracked: apps.length,
        actionable: entries.length,
        overdue: entries.filter((e) => e.urgency === "overdue").length,
        urgent: entries.filter((e) => e.urgency === "urgent").length,
        cold: entries.filter((e) => e.urgency === "cold").length,
        waiting: entries.filter((e) => e.urgency === "waiting").length,
      },
      entries,
      cadenceConfig: { ...DEMO_CADENCE_CONFIG },
    };
  }

  async rescheduleFollowUp(
    input: RescheduleFollowUpInput,
  ): Promise<FollowUpWriteResult> {
    const app = (await this.getApplications()).find((a) => a.num === input.num);
    if (!app) {
      throw new FollowUpWriteError(
        "INVALID_INPUT",
        `Application #${input.num} not found in the demo dataset.`,
      );
    }
    demoPins.set(input.num, { date: input.date, setDate: todayISO() });
    return { ok: true, date: input.date, kind: "reschedule" };
  }

  async logFollowUp(input: LogFollowUpInput): Promise<FollowUpWriteResult> {
    const app = (await this.getApplications()).find((a) => a.num === input.num);
    if (!app) {
      throw new FollowUpWriteError(
        "INVALID_INPUT",
        `Application #${input.num} not found in the demo dataset.`,
      );
    }
    const date = input.date ?? todayISO();
    demoSessionLogs.push({
      num: 0, // renumbered on read, after the dynamic seeded logs
      appNum: input.num,
      date,
      company: app.company,
      role: app.role,
      channel: sanitizeNotes(input.channel ?? "email") || "email",
      contact: sanitizeNotes(input.contact ?? ""),
      notes: sanitizeNotes(input.notes ?? ""),
    });
    const { logs } = await this.getFollowUps();
    return { ok: true, date, kind: "log", num: logs[logs.length - 1].num };
  }

  /* --------------------------------------------------- Outreach (M6) --- */

  async getOutreach(): Promise<OutreachRecord[]> {
    return Object.entries(demoOutreach.applications)
      .map(([num, contacts]) => ({ appNum: Number(num), contacts }))
      .filter((r) => r.contacts.length > 0)
      .sort((a, b) => a.appNum - b.appNum);
  }

  private async assertDemoApp(appNum: number): Promise<void> {
    const app = (await this.getApplications()).find((a) => a.num === appNum);
    if (!app) {
      throw new OutreachWriteError(
        "NOT_FOUND",
        `Application #${appNum} not found in the demo dataset.`,
      );
    }
  }

  async addOutreachContact(
    input: AddOutreachContactInput,
  ): Promise<OutreachMutationResult> {
    await this.assertDemoApp(input.appNum);
    const { doc, contact } = applyAddContact(demoOutreach, input);
    demoOutreach = doc;
    return {
      appNum: input.appNum,
      contacts: doc.applications[String(input.appNum)] ?? [],
      contact,
    };
  }

  async updateOutreachContact(
    input: UpdateOutreachContactInput,
  ): Promise<OutreachMutationResult> {
    await this.assertDemoApp(input.appNum);
    const { doc, contact } = applyUpdateContact(demoOutreach, input);
    demoOutreach = doc;
    return {
      appNum: input.appNum,
      contacts: doc.applications[String(input.appNum)] ?? [],
      contact,
    };
  }

  async deleteOutreachContact(
    input: DeleteOutreachContactInput,
  ): Promise<OutreachMutationResult> {
    await this.assertDemoApp(input.appNum);
    const { doc } = applyDeleteContact(demoOutreach, input);
    demoOutreach = doc;
    return {
      appNum: input.appNum,
      contacts: doc.applications[String(input.appNum)] ?? [],
    };
  }

  /* ------------------------------------------------- Discovery (M5) --- */

  async getPipelineItems(): Promise<PipelineItem[]> {
    return parsePipeline(DEMO_PIPELINE_MD);
  }

  async getScanHistory(): Promise<ScanRecord[]> {
    return DEMO_SCAN_HISTORY.map((r) => scanRecordSchema.parse(r));
  }

  /** Analytics DERIVED from the fixture dataset (fixtures/patterns.ts) with
   * the same outcome/channel math as the real code paths, then re-validated
   * through patternsSchema so fixture drift fails loudly in tests. */
  async getPatterns(): Promise<PatternsResult> {
    const [apps, facets] = await Promise.all([
      this.getApplications(),
      this.getReportFacets(),
    ]);
    return {
      kind: "ok",
      patterns: patternsSchema.parse(buildDemoPatterns(apps, facets, todayISO())),
    };
  }
}
