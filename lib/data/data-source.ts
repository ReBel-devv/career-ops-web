import type {
  AddManualOfferInput,
  AddOutreachContactInput,
  Application,
  CanonicalState,
  DeleteOutreachContactInput,
  Document,
  FollowUpCadence,
  InterviewPrepFile,
  FollowUpData,
  FollowUpWriteResult,
  LogFollowUpInput,
  OutreachMutationResult,
  OutreachRecord,
  PatternsResult,
  PipelineItem,
  Profile,
  ProfileData,
  ProfileDocument,
  Report,
  ReportFacet,
  RescheduleFollowUpInput,
  ScanRecord,
  UpdateApplicationInput,
  UpdateApplicationResult,
  UpdateOutreachContactInput,
  UpdateProfileFieldInput,
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
  /** Company-specific interview-prep markdown files for an application, if any. */
  getInterviewPrep(num: number): Promise<InterviewPrepFile[]>;
  /** Logged follow-ups + pins. (M4) */
  getFollowUps(): Promise<FollowUpData>;
  /** Follow-up cadence from `followup-cadence.mjs --json` — never recomputed. (M4) */
  getFollowUpCadence(): Promise<FollowUpCadence>;
  /** Pipeline inbox items, pending + processed. (M5) */
  getPipelineItems(): Promise<PipelineItem[]>;
  /**
   * Append a MANUAL `[!]` offer to `data/pipeline.md`: saves the pasted JD to
   * `jds/{NNN}-{slug}.md` and inserts a `- [!] {url} | local:jds/… ` line at the
   * top of Pending. Queue-only — the CLI `pipeline` mode does the evaluation.
   * Throws `PipelineWriteError` (INVALID_INPUT/LOCK_TIMEOUT/PARSE_FAILED) or a
   * READ_ONLY error. Returns the created item.
   */
  addManualOffer(input: AddManualOfferInput): Promise<PipelineItem>;
  /** Scanner dedup history. */
  getScanHistory(): Promise<ScanRecord[]>;
  /** Rejection-pattern analytics from `analyze-patterns.mjs --json` — never
   * recomputed. Returns the script's own "not enough data" sentinel as a
   * renderable state. (M5) */
  getPatterns(): Promise<PatternsResult>;
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
  /** All outreach contacts, grouped per application (data/outreach.yml). (M6) */
  getOutreach(): Promise<OutreachRecord[]>;
  /**
   * Outreach mutations — locked atomic read-modify-write of data/outreach.yml,
   * whole-document zod validation + re-parse gate. Stage moves are
   * unrestricted (forward, skip, regress — Decision 5 spirit); setting a stage
   * stamps its date. Throws `OutreachWriteError`
   * (INVALID_INPUT/READ_ONLY/NOT_FOUND/LOCK_TIMEOUT/PARSE_FAILED). (M6) */
  addOutreachContact(
    input: AddOutreachContactInput,
  ): Promise<OutreachMutationResult>;
  updateOutreachContact(
    input: UpdateOutreachContactInput,
  ): Promise<OutreachMutationResult>;
  deleteOutreachContact(
    input: DeleteOutreachContactInput,
  ): Promise<OutreachMutationResult>;

  /* ------------------------------------------------------- Profile --- */

  /**
   * The candidate profile surface: parsed `config/profile.yml` + the source
   * documents that feed it (`sources/`) + the long-form profile texts (cv.md,
   * article-digest.md, voice-dna.md, writing-samples/). Read-only aggregate.
   */
  getProfile(): Promise<ProfileData>;
  /**
   * Edit ONE scalar field of profile.yml (surgical, comment-preserving).
   * Throws `ProfileWriteError` (INVALID_INPUT/READ_ONLY/NOT_FOUND/STALE_FIELD/
   * LOCK_TIMEOUT/PARSE_FAILED). Returns the re-parsed profile.
   */
  updateProfileField(input: UpdateProfileFieldInput): Promise<Profile>;
  /**
   * Save an uploaded source document to `sources/` (never overwrites). Throws
   * `ProfileWriteError` (INVALID_INPUT/READ_ONLY). Returns the descriptor.
   */
  addProfileDocument(
    filename: string,
    bytes: Uint8Array,
  ): Promise<ProfileDocument>;
  /**
   * Read a single source document's bytes for streaming/preview, or null when
   * absent. `name` is a plain basename inside `sources/` (traversal-guarded).
   */
  readProfileDocument(
    name: string,
  ): Promise<{ bytes: Uint8Array; ext: string } | null>;
}
