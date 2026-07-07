import type {
  Application,
  CanonicalState,
  Document,
  FollowUpCadence,
  FollowUpData,
  FollowUpWriteResult,
  LogFollowUpInput,
  PipelineItem,
  Report,
  ReportFacet,
  RescheduleFollowUpInput,
  ScanRecord,
  UpdateApplicationInput,
  UpdateApplicationResult,
} from "@/lib/domain";

/**
 * The contract every backend implements. Two implementations:
 * - `FsDataSource`  — reads the real career-ops repo at CAREER_OPS_PATH.
 * - `DemoDataSource` — fixture-backed, used when DEMO_MODE=true.
 *
 * All reads are performed at request time (the files are living data).
 * The mutation surface (M1) is exactly one tracker cell per call — Status
 * or Notes — guarded by optimistic concurrency (expected company+role).
 * Follow-up appends arrive in M4, outreach.yml in M6.
 */
export interface DataSource {
  /** All tracker rows, in file order (callers sort in memory). */
  getApplications(): Promise<Application[]>;
  /** Canonical states from states.yml, in declared (funnel) order. */
  getStates(): Promise<CanonicalState[]>;
  /** Parsed evaluation report for an application, null when absent. (M3) */
  getReport(num: number): Promise<Report | null>;
  /** Lightweight per-report facets (archetype / vendor / location) for the
   * filters (F4). One entry per report file found. (M3) */
  getReportFacets(): Promise<ReportFacet[]>;
  /** Generated documents (CV + cover letters) for an application. (M3) */
  getDocuments(num: number): Promise<Document[]>;
  /** Logged follow-ups + pins. (M4) */
  getFollowUps(): Promise<FollowUpData>;
  /** Follow-up cadence from `followup-cadence.mjs --json` — never recomputed. (M4) */
  getFollowUpCadence(): Promise<FollowUpCadence>;
  /** Pipeline inbox items, pending + processed. (M5) */
  getPipelineItems(): Promise<PipelineItem[]>;
  /** Scanner dedup history. */
  getScanHistory(): Promise<ScanRecord[]>;
  /**
   * Write ONE tracker cell (Status or Notes) of an existing row. (M1)
   * Throws `TrackerWriteError` (NOT_FOUND, STALE_ROW, INVALID_STATUS,
   * READ_ONLY, LOCK_TIMEOUT, VERIFY_FAILED) — the API route maps codes to
   * HTTP statuses. Never adds or deletes rows.
   */
  updateApplication(
    input: UpdateApplicationInput,
  ): Promise<UpdateApplicationResult>;
  /**
   * Reschedule an application's next follow-up to land on `input.date`.
   * Append-only pin via followup-seed.mjs --force (never edits existing
   * lines). Throws `FollowUpWriteError` on failure. (M4) */
  rescheduleFollowUp(
    input: RescheduleFollowUpInput,
  ): Promise<FollowUpWriteResult>;
  /**
   * Log that a follow-up was sent — appends one table row to
   * data/follow-ups.md (never edits existing lines; re-parse gated). (M4) */
  logFollowUp(input: LogFollowUpInput): Promise<FollowUpWriteResult>;
}
