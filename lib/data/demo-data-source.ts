import {
  addManualOfferInputSchema,
  applicationSchema,
  patternsSchema,
  pipelineItemSchema,
  scanRecordSchema,
  statesFileSchema,
  type AddManualOfferInput,
  type AddOutreachContactInput,
  type Application,
  type CanonicalState,
  type CadenceEntry,
  type DeleteOutreachContactInput,
  type Document,
  type GeneratedDocument,
  type FollowUpCadence,
  type FollowUpData,
  type FollowUpLog,
  type FollowUpUrgency,
  type FollowUpWriteResult,
  type InterviewPrepFile,
  type LogFollowUpInput,
  type OutreachDoc,
  type OutreachMutationResult,
  type OutreachRecord,
  profileDocumentKind,
  PROFILE_UPLOAD_EXTS,
  PROFILE_UPLOAD_MAX_BYTES,
  updateProfileFieldInputSchema,
  type PatternsResult,
  type PipelineItem,
  type Profile,
  type ProfileData,
  type ProfileDocument,
  type Report,
  type ReportFacet,
  type RescheduleFollowUpInput,
  type SaveTemplateInput,
  type ScanRecord,
  type CreateTemplateInput,
  type Template,
  type TemplateDetail,
  type TemplateSummary,
  type TemplateVersion,
  type UpdateApplicationInput,
  type UpdateApplicationResult,
  type UpdateOutreachContactInput,
  type UpdateProfileFieldInput,
} from "@/lib/domain";
import {
  applyAddContact,
  applyDeleteContact,
  applyUpdateContact,
  FollowUpWriteError,
  OutreachWriteError,
  PipelineWriteError,
  ProfileWriteError,
  resolveWritableStatus,
  sanitizeNotes,
  setYamlScalar,
  slugFromUrl,
  templateSlugFromTitle,
  TemplateWriteError,
  TrackerWriteError,
} from "@/lib/writers";
import { parseProfile } from "@/lib/parsers/profile";
import { parsePipeline } from "@/lib/parsers/pipeline";
import { parseReport, reportFacet } from "@/lib/parsers/report";
import { DEMO_APPS } from "@/fixtures/apps";
import { DEMO_REPORTS } from "@/fixtures/reports";
import { DEMO_CADENCE_CONFIG, DEMO_FOLLOW_UP_SEEDS } from "@/fixtures/follow-ups";
import { buildDemoOutreach } from "@/fixtures/outreach";
import { DEMO_PIPELINE_MD, DEMO_SCAN_HISTORY } from "@/fixtures/discovery";
import { DEMO_DOCUMENTS } from "@/fixtures/pdfs";
import { buildDemoGeneratedDocuments } from "@/fixtures/generated-docs";
import { buildDemoPatterns } from "@/fixtures/patterns";
import {
  DEMO_PROFILE_DOCUMENTS,
  DEMO_PROFILE_TEXTS,
  DEMO_PROFILE_YAML,
} from "@/fixtures/profile";
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

/** Manually-added `[!]` offers (session-only). Prepended to the parsed fixture
 * pipeline so the Discovery inbox reflects the add without touching any file. */
const demoManualOffers: PipelineItem[] = [];

/** In-memory profile YAML, edited through the SAME `setYamlScalar` the FS
 * writer uses (Decision 6 — session-only, no filesystem). */
let demoProfileYaml = DEMO_PROFILE_YAML;

/** Session-added source documents, prepended to the seeded demo documents. */
const demoProfileDocs: ProfileDocument[] = [];

/** In-memory templates store (session-only), seeded with two fixtures. */
interface DemoTemplateEntry {
  template: Template;
  versions: Array<TemplateVersion & { body: string }>;
}

function seedDemoTemplate(entry: {
  slug: string;
  title: string;
  type: string | null;
  savedAt: string;
  body: string;
}): [string, DemoTemplateEntry] {
  return [
    entry.slug,
    {
      template: {
        slug: entry.slug,
        title: entry.title,
        type: entry.type,
        savedAt: entry.savedAt,
        source: "manual",
        note: null,
        body: entry.body,
      },
      versions: [
        {
          version: 1,
          savedAt: entry.savedAt,
          source: "manual",
          note: null,
          body: entry.body,
        },
      ],
    },
  ];
}

const demoTemplates = new Map<string, DemoTemplateEntry>([
  seedDemoTemplate({
    slug: "linkedin-recruiter-intro",
    title: "LinkedIn — recruiter intro",
    type: "linkedin",
    savedAt: "2026-06-20T09:00:00.000Z",
    body: [
      "Hi — I saw you recruit for frontend roles.",
      "",
      "I'm a React/TypeScript engineer focused on product polish and DX.",
      "Would you be open to a quick chat about what your clients look for?",
    ].join("\n"),
  }),
  seedDemoTemplate({
    slug: "follow-up-email",
    title: "Email — application follow-up",
    type: "email",
    savedAt: "2026-06-22T10:30:00.000Z",
    body: [
      "Subject: Following up on my application",
      "",
      "Hello,",
      "",
      "I applied last week and wanted to reiterate my interest.",
      "Happy to share anything else that would help the review.",
      "",
      "Best regards,",
    ].join("\n"),
  }),
]);

const DEMO_ACTIONABLE_IDS = new Set(["applied", "responded", "interview"]);
const APPLIED_FIRST = DEMO_CADENCE_CONFIG.applied_first;

/** Fictional interview-prep notes for the demo (app #26, Emberfield, Interview). */
const DEMO_INTERVIEW_PREP: Record<number, InterviewPrepFile[]> = {
  26: [
    {
      fileName: "emberfield-ui-engineer-motion.md",
      markdown: [
        "# Emberfield — UI Engineer, Motion",
        "",
        "## Company angle",
        "- Motion-first product team; portfolio landed the technical round.",
        "- Emphasis on craft: micro-interactions, spring physics, reduced-motion a11y.",
        "",
        "## Likely questions",
        "1. Walk through a complex animation you shipped and how you kept it 60fps.",
        "2. How do you reconcile motion with accessibility (`prefers-reduced-motion`)?",
        "3. Trade-offs: CSS transitions vs. a JS animation library.",
        "",
        "## STAR to lead with",
        "- **Situation:** dashboard felt static; **Task:** add meaningful motion;",
        "  **Action:** built a reusable transition layer; **Result:** +engagement, no perf regression.",
      ].join("\n"),
    },
  ],
};

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

  async getGeneratedDocuments(): Promise<GeneratedDocument[]> {
    return buildDemoGeneratedDocuments();
  }

  async getInterviewPrep(num: number): Promise<InterviewPrepFile[]> {
    return DEMO_INTERVIEW_PREP[num] ?? [];
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
    // Session-added manual offers sit at the top of Pending (mirrors the FS
    // writer, which inserts at the top of the `## Pending` section).
    return [...demoManualOffers, ...parsePipeline(DEMO_PIPELINE_MD)];
  }

  /** In-memory manual-offer add (never touches the filesystem). */
  async addManualOffer(input: AddManualOfferInput): Promise<PipelineItem> {
    const parsed = addManualOfferInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new PipelineWriteError(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid manual offer input.",
      );
    }
    const { url } = parsed.data;
    const num = 900 + demoManualOffers.length + 1; // demo-only synthetic jds number
    const item = pipelineItemSchema.parse({
      section: "pending",
      kind: "manual",
      url,
      company: null,
      role: null,
      reportNum: null,
      scoreRaw: null,
      localJd: `jds/${num}-${slugFromUrl(url)}.md`,
      raw: `- [!] ${url} | local:jds/${num}-${slugFromUrl(url)}.md | note: manual — added via dashboard (demo)`,
    });
    demoManualOffers.unshift(item);
    return item;
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

  /* ---------------------------------------------------- Profile --- */

  async getProfile(): Promise<ProfileData> {
    return {
      profile: parseProfile(demoProfileYaml),
      documents: [...demoProfileDocs, ...DEMO_PROFILE_DOCUMENTS],
      texts: DEMO_PROFILE_TEXTS,
    };
  }

  /** In-memory single-field edit — reuses the REAL `setYamlScalar`. */
  async updateProfileField(input: UpdateProfileFieldInput): Promise<Profile> {
    const parsed = updateProfileFieldInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ProfileWriteError(
        "INVALID_INPUT",
        parsed.error.issues[0]?.message ?? "Invalid profile edit.",
      );
    }
    const { field, value, expected } = parsed.data;
    const [parentKey, childKey] = field.split(".");

    if (typeof expected === "string") {
      const current = parseProfile(demoProfileYaml);
      const seen = readProfileField(current, field);
      if (seen !== expected.trim()) {
        throw new ProfileWriteError(
          "STALE_FIELD",
          "This field changed since you loaded it — reload and try again.",
        );
      }
    }

    const updated = setYamlScalar(demoProfileYaml, parentKey, childKey, value);
    if (updated === null) {
      throw new ProfileWriteError(
        "NOT_FOUND",
        `Could not locate "${field}" in the demo profile.`,
      );
    }
    const profile = parseProfile(updated); // round-trip / validation gate
    demoProfileYaml = updated;
    return profile;
  }

  /** In-memory document add (bytes are discarded — demo never serves files). */
  async addProfileDocument(
    filename: string,
    bytes: Uint8Array,
  ): Promise<ProfileDocument> {
    const base = filename.split(/[\\/]/).pop()?.trim() ?? "";
    const dot = base.lastIndexOf(".");
    const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
    if (base === "" || !(PROFILE_UPLOAD_EXTS as readonly string[]).includes(ext)) {
      throw new ProfileWriteError(
        "INVALID_INPUT",
        `Unsupported file type. Allowed: ${PROFILE_UPLOAD_EXTS.join(", ")}.`,
      );
    }
    if (bytes.byteLength === 0) {
      throw new ProfileWriteError("INVALID_INPUT", "The file is empty.");
    }
    if (bytes.byteLength > PROFILE_UPLOAD_MAX_BYTES) {
      throw new ProfileWriteError("INVALID_INPUT", "File is too large.");
    }
    const doc: ProfileDocument = {
      name: base,
      ext,
      kind: profileDocumentKind(ext),
      sizeBytes: bytes.byteLength,
      modifiedMs: Date.now(),
    };
    demoProfileDocs.unshift(doc);
    return doc;
  }

  /** Demo mode never serves real bytes — previews 404 gracefully. */
  async readProfileDocument(): Promise<{ bytes: Uint8Array; ext: string } | null> {
    return null;
  }

  /* ----------------------------------------------------- Templates --- */

  async getTemplates(): Promise<TemplateSummary[]> {
    return [...demoTemplates.values()]
      .map(({ template, versions }) => {
        const firstLine =
          template.body
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.length > 0) ?? "";
        return {
          slug: template.slug,
          title: template.title,
          type: template.type,
          savedAt: template.savedAt,
          versionCount: versions.length,
          excerpt:
            firstLine.length > 140 ? `${firstLine.slice(0, 139)}…` : firstLine,
          body: template.body,
        };
      })
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async getTemplate(slug: string): Promise<TemplateDetail | null> {
    const entry = demoTemplates.get(slug);
    if (!entry) return null;
    return {
      template: { ...entry.template },
      versions: entry.versions
        .map(({ body: _body, ...meta }) => meta)
        .sort((a, b) => b.version - a.version),
    };
  }

  async getTemplateVersion(
    slug: string,
    version: number,
  ): Promise<(TemplateVersion & { body: string }) | null> {
    const entry = demoTemplates.get(slug);
    return entry?.versions.find((v) => v.version === version) ?? null;
  }

  /** In-memory create — same slug/validation semantics as FS mode. */
  async createTemplate(input: CreateTemplateInput): Promise<TemplateDetail> {
    const base = templateSlugFromTitle(input.title);
    let slug = base;
    for (let i = 2; demoTemplates.has(slug); i += 1) slug = `${base}-${i}`;
    const savedAt = new Date().toISOString();
    const template: Template = {
      slug,
      title: input.title,
      type: input.type ?? null,
      savedAt,
      source: input.source,
      note: input.note ?? null,
      body: input.body.trimEnd(),
    };
    demoTemplates.set(slug, {
      template,
      versions: [
        {
          version: 1,
          savedAt,
          source: input.source,
          note: input.note ?? null,
          body: template.body,
        },
      ],
    });
    return this.getTemplate(slug) as Promise<TemplateDetail>;
  }

  /** In-memory save — same STALE/NOT_FOUND semantics as FS mode. */
  async saveTemplate(input: SaveTemplateInput): Promise<TemplateDetail> {
    const entry = demoTemplates.get(input.slug);
    if (!entry) {
      throw new TemplateWriteError(
        "NOT_FOUND",
        `Template "${input.slug}" not found.`,
      );
    }
    if (entry.template.savedAt !== input.expectedSavedAt) {
      throw new TemplateWriteError(
        "STALE_TEMPLATE",
        "The template changed since it was loaded. Reload and retry.",
      );
    }
    const savedAt = new Date().toISOString();
    const version =
      (entry.versions[entry.versions.length - 1]?.version ?? 0) + 1;
    entry.template = {
      ...entry.template,
      title: input.title,
      type: input.type ?? null,
      savedAt,
      source: input.source,
      note: input.note ?? null,
      body: input.body.trimEnd(),
    };
    entry.versions.push({
      version,
      savedAt,
      source: input.source,
      note: input.note ?? null,
      body: entry.template.body,
    });
    return this.getTemplate(input.slug) as Promise<TemplateDetail>;
  }
}

/** Read a scalar profile field by its YAML `parent.child` path ("" if unset). */
function readProfileField(profile: Profile, field: string): string {
  const map: Record<string, string | null | undefined> = {
    "candidate.full_name": profile.candidate.fullName,
    "candidate.email": profile.candidate.email,
    "candidate.phone": profile.candidate.phone,
    "candidate.location": profile.candidate.location,
    "candidate.linkedin": profile.candidate.linkedin,
    "candidate.portfolio_url": profile.candidate.portfolioUrl,
    "candidate.github": profile.candidate.github,
    "narrative.headline": profile.narrative.headline,
    "narrative.exit_story": profile.narrative.exitStory,
    "compensation.target_range": profile.compensation.targetRange,
    "compensation.currency": profile.compensation.currency,
    "compensation.minimum": profile.compensation.minimum,
    "compensation.location_flexibility": profile.compensation.locationFlexibility,
    "location.country": profile.location.country,
    "location.city": profile.location.city,
    "location.timezone": profile.location.timezone,
    "location.visa_status": profile.location.visaStatus,
    "cover_letter.primary_domain": profile.coverLetter.primaryDomain,
  };
  return (map[field] ?? "").trim();
}
