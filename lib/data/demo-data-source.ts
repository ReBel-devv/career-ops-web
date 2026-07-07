import {
  applicationSchema,
  statesFileSchema,
  type Application,
  type CanonicalState,
  type FollowUpData,
  type PipelineItem,
  type Report,
  type ScanRecord,
  type UpdateApplicationInput,
  type UpdateApplicationResult,
} from "@/lib/domain";
import {
  resolveWritableStatus,
  sanitizeNotes,
  TrackerWriteError,
} from "@/lib/writers";
import type { DataSource } from "./data-source";

/**
 * Fixture-backed DataSource used when DEMO_MODE=true. Never touches the
 * filesystem. M0 ships a minimal fictional dataset — the full ~30-application
 * anonymized demo (with reports, follow-ups, in-memory writes) lands in M7.
 * All companies and people are invented.
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

interface DemoApp {
  num: number;
  date: string;
  company: string;
  role: string;
  score: number | null;
  statusId: string;
  hasPdf: boolean;
  notes: string;
}

const DEMO_APPS: DemoApp[] = [
  { num: 1, date: "2026-06-02", company: "Nimbus Labs", role: "Design Engineer", score: 4.4, statusId: "interview", hasPdf: true, notes: "Exact archetype match — React/Tailwind/motion. Second-round interview scheduled." },
  { num: 2, date: "2026-06-03", company: "Vectorline", role: "Frontend Engineer, Platform", score: 3.8, statusId: "applied", hasPdf: true, notes: "Strong stack overlap; platform emphasis is a slight mismatch." },
  { num: 3, date: "2026-06-05", company: "Acme Intelligence", role: "Senior Fullstack Engineer", score: 2.4, statusId: "skip", hasPdf: false, notes: "SKIP — 8+ years required plus heavy backend focus." },
  { num: 4, date: "2026-06-09", company: "Helioscope", role: "Product Engineer", score: 4.1, statusId: "offer", hasPdf: true, notes: "Offer received — remote-first, AI product surface, strong craft culture." },
  { num: 5, date: "2026-06-12", company: "Quartzworks", role: "UI Engineer", score: 3.2, statusId: "evaluated", hasPdf: false, notes: "Borderline — good stack but design-system-only scope." },
  { num: 6, date: "2026-06-16", company: "Lumen Systems", role: "Frontend Engineer, AI Tools", score: 3.9, statusId: "rejected", hasPdf: true, notes: "Rejected after take-home; feedback: seniority bar." },
  { num: 7, date: "2026-06-20", company: "Driftworks", role: "Design Engineer, Web", score: 3.5, statusId: "responded", hasPdf: true, notes: "Recruiter replied — screening call to book." },
  { num: 8, date: "2026-06-24", company: "Parallax Digital", role: "Creative Developer", score: 2.9, statusId: "discarded", hasPdf: false, notes: "Posting closed before applying." },
];

/**
 * In-memory demo write overrides (Decision 6): the public demo is fully
 * interactive but stateless — overrides live in this module's memory only,
 * are keyed by app num, and vanish on server restart / new serverless
 * instance. Never touches any file.
 */
const demoOverrides = new Map<number, { statusId?: string; notes?: string }>();

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
        reportPath: null,
        notes,
        location: null,
      });
    });
  }

  /** Per-instance in-memory write — same validation + error codes as FS mode. */
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

  async getReport(_num: number): Promise<Report | null> {
    return null; // M7: fictional English reports
  }

  async getFollowUps(): Promise<FollowUpData> {
    return { logs: [], pins: [] }; // M7: dynamic date offsets so demo never stales
  }

  async getPipelineItems(): Promise<PipelineItem[]> {
    return [];
  }

  async getScanHistory(): Promise<ScanRecord[]> {
    return [];
  }
}
