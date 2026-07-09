import { promises as fs } from "node:fs";
import path from "node:path";
import {
  applicationSchema,
  buildStatusResolver,
  parsePdfCell,
  parseReportCell,
  parseScoreCell,
  scanRecordSchema,
  type AddOutreachContactInput,
  type Application,
  type CanonicalState,
  type DeleteOutreachContactInput,
  type Document,
  type FollowUpCadence,
  type FollowUpData,
  type FollowUpWriteResult,
  type LogFollowUpInput,
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
import { getConfig } from "@/lib/config";
import { parseReport, reportFacet } from "@/lib/parsers/report";
import { parseFollowUps } from "@/lib/parsers/follow-ups";
import { parsePipeline } from "@/lib/parsers/pipeline";
import { matchDocuments, parsePdfIndex } from "@/lib/parsers/documents";
import {
  runAnalyzePatterns,
  runFollowupCadence,
  runFollowupReschedule,
  runFollowupSeed,
  runTrackerSync,
} from "@/lib/scripts";
import {
  addOutreachContact,
  appendFollowUpLog,
  deleteOutreachContact,
  FollowUpWriteError,
  OutreachWriteError,
  parseOutreachDoc,
  TrackerWriteError,
  updateOutreachContact,
  writeTrackerCell,
} from "@/lib/writers";
import type { DataSource } from "./data-source";
import { readStatesFile } from "./states-file";
import { loadTrackerParse, type TrackerRow } from "./tracker-module";

/**
 * Reads (and, since M1, surgically writes) the real career-ops data repo.
 * Column mapping and row parsing are delegated to the repo's own
 * `tracker-parse.mjs` (never reimplemented); states.yml is parsed at request
 * time; every boundary is zod-validated. The write surface is exactly one
 * tracker cell per call (see lib/writers/tracker-writer.ts).
 */
export class FsDataSource implements DataSource {
  constructor(private readonly repoPath: string) {}

  private resolve(...segments: string[]): string {
    return path.join(this.repoPath, ...segments);
  }

  async getStates(): Promise<CanonicalState[]> {
    return readStatesFile(this.repoPath);
  }

  async getApplications(): Promise<Application[]> {
    const [trackerParse, states, content] = await Promise.all([
      loadTrackerParse(this.repoPath),
      this.getStates(),
      fs.readFile(this.resolve("data", "applications.md"), "utf8"),
    ]);
    const resolveStatus = buildStatusResolver(states);
    const lines = content.split(/\r?\n/);
    const colmap = trackerParse.resolveColumns(lines);

    const applications: Application[] = [];
    for (const line of lines) {
      const row = trackerParse.parseTrackerRow(line, colmap);
      if (!row) continue; // header, separator, or non-table line
      applications.push(applicationSchema.parse(toApplication(row, resolveStatus)));
    }
    return applications;
  }

  async getScanHistory(): Promise<ScanRecord[]> {
    let content: string;
    try {
      content = await fs.readFile(this.resolve("data", "scan-history.tsv"), "utf8");
    } catch (error: unknown) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
    // First line is the header: url, first_seen, portal, title, company, status, location
    return lines.slice(1).map((line) => {
      const cells = line.split("\t");
      return scanRecordSchema.parse({
        url: cells[0] ?? "",
        firstSeen: cells[1] ?? "",
        portal: cells[2] ?? "",
        title: cells[3] ?? "",
        company: cells[4] ?? "",
        status: cells[5] ?? "",
        location: cells[6] ?? "",
      });
    });
  }

  /** Find the report file whose name starts with the zero-padded number. */
  private async findReportFile(num: number): Promise<string | null> {
    const prefix = `${String(num).padStart(3, "0")}-`;
    let files: string[];
    try {
      files = await fs.readdir(this.resolve("reports"));
    } catch (error: unknown) {
      if (isNotFound(error)) return null;
      throw error;
    }
    const match = files.find((f) => f.startsWith(prefix) && f.endsWith(".md"));
    return match ?? null;
  }

  /**
   * Resolve a tracker row's report link against the tracker file's own
   * directory (links are written relative to the tracker, e.g.
   * `../reports/028-acme.md` — see merge-tracker.mjs normalization). Returns
   * the report's absolute path, guarded to stay inside the repo.
   */
  private async reportPathFromTracker(num: number): Promise<string | null> {
    let apps: Application[];
    try {
      apps = await this.getApplications();
    } catch {
      return null;
    }
    const linked = apps.find((a) => a.num === num)?.reportPath;
    if (!linked) return null;
    const trackerDir = this.resolve("data");
    const resolved = path.resolve(trackerDir, linked);
    const repoRoot = path.resolve(this.repoPath);
    if (!resolved.startsWith(repoRoot + path.sep)) return null; // never escape
    return resolved;
  }

  async getReport(num: number): Promise<Report | null> {
    // Primary: the tracker's own report link, resolved against data/.
    const fromTracker = await this.reportPathFromTracker(num);
    if (fromTracker) {
      try {
        const content = await fs.readFile(fromTracker, "utf8");
        const rel = path
          .relative(path.resolve(this.repoPath), fromTracker)
          .split(path.sep)
          .join("/");
        return parseReport({ content, path: rel, num });
      } catch (error: unknown) {
        if (!isNotFound(error)) throw error;
        // Broken link → fall through to the filename scan.
      }
    }
    // Fallback: scan reports/ for the zero-padded num prefix.
    const filename = await this.findReportFile(num);
    if (!filename) return null;
    const relPath = `reports/${filename}`;
    const content = await fs.readFile(this.resolve(relPath), "utf8");
    return parseReport({ content, path: relPath, num });
  }

  async getReportFacets(): Promise<ReportFacet[]> {
    let files: string[];
    try {
      files = await fs.readdir(this.resolve("reports"));
    } catch (error: unknown) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const reports = files.filter((f) => /^\d+-.*\.md$/.test(f));
    const facets = await Promise.all(
      reports.map(async (filename) => {
        const num = Number.parseInt(filename.slice(0, filename.indexOf("-")), 10);
        if (!Number.isInteger(num)) return null;
        const content = await fs.readFile(this.resolve("reports", filename), "utf8");
        return reportFacet(parseReport({ content, path: `reports/${filename}`, num }));
      }),
    );
    return facets.filter((f): f is ReportFacet => f !== null);
  }

  async getDocuments(num: number): Promise<Document[]> {
    const [indexContent, outputFiles, reportFilename] = await Promise.all([
      fs.readFile(this.resolve("data", "pdf-index.tsv"), "utf8").catch((e: unknown) => {
        if (isNotFound(e)) return "";
        throw e;
      }),
      fs.readdir(this.resolve("output")).catch((e: unknown) => {
        if (isNotFound(e)) return [] as string[];
        throw e;
      }),
      this.findReportFile(num),
    ]);
    return matchDocuments({
      num,
      reportFilename,
      indexEntries: parsePdfIndex(indexContent),
      outputFiles: outputFiles.filter((f) => f.toLowerCase().endsWith(".pdf")),
    });
  }

  async getFollowUps(): Promise<FollowUpData> {
    let content: string;
    try {
      content = await fs.readFile(this.resolve("data", "follow-ups.md"), "utf8");
    } catch (error: unknown) {
      if (isNotFound(error)) return { logs: [], pins: [] };
      throw error;
    }
    return parseFollowUps(content);
  }

  async getFollowUpCadence(): Promise<FollowUpCadence> {
    return runFollowupCadence(this.repoPath);
  }

  async rescheduleFollowUp(
    input: RescheduleFollowUpInput,
  ): Promise<FollowUpWriteResult> {
    if (getConfig().readOnly) {
      throw new FollowUpWriteError(
        "READ_ONLY",
        "READ_ONLY is set — all mutations are disabled.",
      );
    }
    // applied_first comes from the CLI's own cadence config (profile.yml +
    // defaults) — the only place it's authoritatively resolved.
    const cadence = await this.getFollowUpCadence();
    const appliedFirst = cadence.cadenceConfig.applied_first ?? 7;
    const result = await runFollowupReschedule(
      this.repoPath,
      input.num,
      input.date,
      appliedFirst,
    );
    if (!result.ok) {
      throw new FollowUpWriteError("PARSE_FAILED", result.error);
    }
    return { ok: true, date: result.date, kind: "reschedule" };
  }

  async logFollowUp(input: LogFollowUpInput): Promise<FollowUpWriteResult> {
    if (getConfig().readOnly) {
      throw new FollowUpWriteError(
        "READ_ONLY",
        "READ_ONLY is set — all mutations are disabled.",
      );
    }
    const app = (await this.getApplications()).find((a) => a.num === input.num);
    if (!app) {
      throw new FollowUpWriteError(
        "INVALID_INPUT",
        `Application #${input.num} not found in the tracker.`,
      );
    }
    const { num, date } = await appendFollowUpLog({
      repoPath: this.repoPath,
      appNum: input.num,
      company: app.company,
      role: app.role,
      date: input.date,
      channel: input.channel,
      contact: input.contact,
      notes: input.notes,
    });
    return { ok: true, date, kind: "log", num };
  }

  /* --------------------------------------------------- Outreach (M6) --- */

  /** All outreach contacts from data/outreach.yml (missing/empty file → []). */
  async getOutreach(): Promise<OutreachRecord[]> {
    let content: string;
    try {
      content = await fs.readFile(this.resolve("data", "outreach.yml"), "utf8");
    } catch (error: unknown) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const doc = parseOutreachDoc(content);
    return Object.entries(doc.applications)
      .map(([num, contacts]) => ({ appNum: Number(num), contacts }))
      .filter((r) => Number.isInteger(r.appNum) && r.contacts.length > 0)
      .sort((a, b) => a.appNum - b.appNum);
  }

  /** READ_ONLY guard + tracker-existence check shared by outreach mutations. */
  private async guardOutreachWrite(appNum: number): Promise<void> {
    if (getConfig().readOnly) {
      throw new OutreachWriteError(
        "READ_ONLY",
        "READ_ONLY is set — all mutations are disabled.",
      );
    }
    const app = (await this.getApplications()).find((a) => a.num === appNum);
    if (!app) {
      throw new OutreachWriteError(
        "NOT_FOUND",
        `Application #${appNum} not found in the tracker.`,
      );
    }
  }

  async addOutreachContact(
    input: AddOutreachContactInput,
  ): Promise<OutreachMutationResult> {
    await this.guardOutreachWrite(input.appNum);
    return addOutreachContact(this.repoPath, input);
  }

  async updateOutreachContact(
    input: UpdateOutreachContactInput,
  ): Promise<OutreachMutationResult> {
    await this.guardOutreachWrite(input.appNum);
    return updateOutreachContact(this.repoPath, input);
  }

  async deleteOutreachContact(
    input: DeleteOutreachContactInput,
  ): Promise<OutreachMutationResult> {
    await this.guardOutreachWrite(input.appNum);
    return deleteOutreachContact(this.repoPath, input);
  }

  /** Discovery inbox — read-only parse of data/pipeline.md (plan §4.4). */
  async getPipelineItems(): Promise<PipelineItem[]> {
    let content: string;
    try {
      content = await fs.readFile(this.resolve("data", "pipeline.md"), "utf8");
    } catch (error: unknown) {
      if (isNotFound(error)) return [];
      throw error;
    }
    return parsePipeline(content);
  }

  /** analyze-patterns.mjs --json, zod-validated (never recomputed). */
  async getPatterns(): Promise<PatternsResult> {
    return runAnalyzePatterns(this.repoPath);
  }

  /**
   * Surgical single-cell tracker write (plan §4.1). Side effects:
   * - transition INTO Applied → `followup-seed.mjs <num> --date <today> --json`
   * - derived `data/applications.db` exists → `tracker.mjs sync`
   * Both are non-fatal: the cell write has already been verified and
   * committed; their outcome is reported so the UI can toast it.
   */
  async updateApplication(
    input: UpdateApplicationInput,
  ): Promise<UpdateApplicationResult> {
    if (getConfig().readOnly) {
      throw new TrackerWriteError(
        "READ_ONLY",
        "READ_ONLY is set — all mutations are disabled.",
      );
    }

    const write = await writeTrackerCell({
      repoPath: this.repoPath,
      num: input.num,
      expected: input.expected,
      status: input.status,
      notes: input.notes,
    });

    const resolveStatus = buildStatusResolver(write.states);
    const application = applicationSchema.parse(
      toApplication(write.row, resolveStatus),
    );
    const result: UpdateApplicationResult = {
      application,
      notesSanitized: write.notesSanitized,
    };

    if (write.transitionedToApplied) {
      const today = new Date().toISOString().slice(0, 10);
      result.followupSeed = await runFollowupSeed(this.repoPath, input.num, today);
    }
    result.trackerSync = await runTrackerSync(this.repoPath);
    return result;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function toApplication(
  row: TrackerRow,
  resolveStatus: (raw: string) => CanonicalState | null,
): Application {
  const state = resolveStatus(row.status);
  const report = parseReportCell(row.report);
  return {
    num: row.num,
    date: row.date,
    company: row.company,
    role: row.role,
    scoreRaw: row.score,
    score: parseScoreCell(row.score),
    statusRaw: row.status,
    statusId: state?.id ?? null,
    statusLabel: state?.label ?? null,
    dashboardGroup: state?.dashboardGroup ?? null,
    hasPdf: parsePdfCell(row.pdf),
    reportPath: report?.path ?? null,
    notes: row.notes,
    location: row.location ?? null,
  };
}
