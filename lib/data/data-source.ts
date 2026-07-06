import type {
  Application,
  CanonicalState,
  FollowUpData,
  PipelineItem,
  Report,
  ScanRecord,
} from "@/lib/domain";

/**
 * The contract every backend implements. Two implementations:
 * - `FsDataSource`  — reads the real career-ops repo at CAREER_OPS_PATH.
 * - `DemoDataSource` — fixture-backed, used when DEMO_MODE=true.
 *
 * All reads are performed at request time (the files are living data).
 * Mutations are deliberately absent in M0 — the writer surface (tracker
 * Status/Notes cells, follow-up appends, outreach.yml) arrives in M1/M4/M6.
 */
export interface DataSource {
  /** All tracker rows, in file order (callers sort in memory). */
  getApplications(): Promise<Application[]>;
  /** Canonical states from states.yml, in declared (funnel) order. */
  getStates(): Promise<CanonicalState[]>;
  /** Parsed evaluation report for an application, null when absent. (M3) */
  getReport(num: number): Promise<Report | null>;
  /** Logged follow-ups + pins. (M4) */
  getFollowUps(): Promise<FollowUpData>;
  /** Pipeline inbox items, pending + processed. (M5) */
  getPipelineItems(): Promise<PipelineItem[]>;
  /** Scanner dedup history. */
  getScanHistory(): Promise<ScanRecord[]>;
}
