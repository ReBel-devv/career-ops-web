import { promises as fs } from "node:fs";
import path from "node:path";
import {
  applicationSchema,
  buildStatusResolver,
  parsePdfCell,
  parseReportCell,
  parseScoreCell,
  profileDocumentKind,
  scanRecordSchema,
  type AddManualOfferInput,
  type AddOutreachContactInput,
  type Application,
  type CanonicalState,
  type DeleteOutreachContactInput,
  type Document,
  type FollowUpCadence,
  type FollowUpData,
  type FollowUpWriteResult,
  type InterviewPrepFile,
  type LogFollowUpInput,
  type OutreachMutationResult,
  type OutreachRecord,
  type GeneratedDocument,
  type PatternsResult,
  type PipelineItem,
  type Profile,
  type ProfileData,
  type ProfileDocument,
  type ProfileTexts,
  type ProfileWritingSample,
  type Report,
  type ReportFacet,
  type RescheduleFollowUpInput,
  type ScanRecord,
  type UpdateApplicationInput,
  type UpdateApplicationResult,
  type UpdateOutreachContactInput,
  type UpdateProfileFieldInput,
} from "@/lib/domain";
import { getConfig } from "@/lib/config";
import { isReportFile, parseReport, reportFacet } from "@/lib/parsers/report";
import { parseFollowUps } from "@/lib/parsers/follow-ups";
import { parsePipeline } from "@/lib/parsers/pipeline";
import { matchDocuments, parsePdfIndex } from "@/lib/parsers/documents";
import { buildGeneratedDocuments } from "@/lib/parsers/generated-docs";
import { matchInterviewPrep } from "@/lib/parsers/interview-prep";
import {
  runAnalyzePatterns,
  runFollowupCadence,
  runFollowupReschedule,
  runFollowupSeed,
  runTrackerSync,
} from "@/lib/scripts";
import {
  addManualOffer,
  addOutreachContact,
  addProfileDocument,
  appendFollowUpLog,
  deleteOutreachContact,
  FollowUpWriteError,
  OutreachWriteError,
  parseOutreachDoc,
  PipelineWriteError,
  ProfileWriteError,
  setProfileField,
  TrackerWriteError,
  updateOutreachContact,
  writeTrackerCell,
} from "@/lib/writers";
import { parseProfile } from "@/lib/parsers/profile";
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
    const match = files.find((f) => f.startsWith(prefix) && isReportFile(f));
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
    const reports = files.filter(isReportFile);
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
    const [indexContent, outputFiles, reportFilename, apps] = await Promise.all([
      fs.readFile(this.resolve("data", "pdf-index.tsv"), "utf8").catch((e: unknown) => {
        if (isNotFound(e)) return "";
        throw e;
      }),
      fs.readdir(this.resolve("output")).catch((e: unknown) => {
        if (isNotFound(e)) return [] as string[];
        throw e;
      }),
      this.findReportFile(num),
      this.getApplications().catch(() => [] as Application[]),
    ]);
    const app = apps.find((a) => a.num === num);
    return matchDocuments({
      num,
      reportFilename,
      indexEntries: parsePdfIndex(indexContent),
      outputFiles: outputFiles.filter((f) => f.toLowerCase().endsWith(".pdf")),
      ...(app
        ? {
            app: { company: app.company, role: app.role },
            // Same-company rows disambiguate a cover among several roles.
            siblings: apps
              .filter((a) => a.company === app.company)
              .map((a) => ({ num: a.num, company: a.company, role: a.role })),
          }
        : {}),
    });
  }

  /** Every generated CV + cover letter across all applications (library). */
  async getGeneratedDocuments(): Promise<GeneratedDocument[]> {
    const [indexContent, outputNames, apps] = await Promise.all([
      fs.readFile(this.resolve("data", "pdf-index.tsv"), "utf8").catch((e: unknown) => {
        if (isNotFound(e)) return "";
        throw e;
      }),
      fs.readdir(this.resolve("output")).catch((e: unknown) => {
        if (isNotFound(e)) return [] as string[];
        throw e;
      }),
      this.getApplications().catch(() => [] as Application[]),
    ]);

    const pdfNames = outputNames.filter((n) => n.toLowerCase().endsWith(".pdf"));
    const outputFiles = await Promise.all(
      pdfNames.map(async (name) => {
        try {
          const stat = await fs.stat(this.resolve("output", name));
          return { name, sizeBytes: stat.size, mtimeMs: stat.mtimeMs };
        } catch {
          return { name, sizeBytes: 0, mtimeMs: 0 };
        }
      }),
    );

    return buildGeneratedDocuments({
      indexEntries: parsePdfIndex(indexContent),
      outputFiles,
      apps: apps.map((a) => ({
        num: a.num,
        company: a.company,
        role: a.role,
        statusId: a.statusId,
        statusLabel: a.statusLabel,
      })),
    });
  }

  async getInterviewPrep(num: number): Promise<InterviewPrepFile[]> {
    const [prepFiles, apps] = await Promise.all([
      fs.readdir(this.resolve("interview-prep")).catch((e: unknown) => {
        if (isNotFound(e)) return [] as string[];
        throw e;
      }),
      this.getApplications().catch(() => [] as Application[]),
    ]);
    const app = apps.find((a) => a.num === num);
    if (!app) return [];
    const matched = matchInterviewPrep({
      num,
      app: { company: app.company, role: app.role },
      siblings: apps
        .filter((a) => a.company === app.company)
        .map((a) => ({ num: a.num, company: a.company, role: a.role })),
      prepFiles,
    });
    // Read each matched file's markdown. Guard against traversal: `matched`
    // basenames come straight from readdir, but validate anyway before reading.
    const files: InterviewPrepFile[] = [];
    for (const fileName of matched) {
      if (!/^[A-Za-z0-9._-]+\.md$/.test(fileName) || fileName.includes("..")) continue;
      const full = this.resolve("interview-prep", fileName);
      if (full !== path.join(this.resolve("interview-prep"), fileName)) continue;
      try {
        const markdown = await fs.readFile(full, "utf8");
        files.push({ fileName, markdown });
      } catch (error: unknown) {
        if (!isNotFound(error)) throw error;
      }
    }
    return files;
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

  /** Append a manual `[!]` offer (JD saved to jds/, line added to pipeline.md). */
  async addManualOffer(input: AddManualOfferInput): Promise<PipelineItem> {
    if (getConfig().readOnly) {
      throw new PipelineWriteError(
        "READ_ONLY",
        "READ_ONLY is set — all mutations are disabled.",
      );
    }
    return addManualOffer(this.repoPath, input);
  }

  /** analyze-patterns.mjs --json, zod-validated (never recomputed). */
  async getPatterns(): Promise<PatternsResult> {
    return runAnalyzePatterns(this.repoPath);
  }

  /* ---------------------------------------------------- Profile --- */

  /** List real documents in `sources/` (skips README + hidden/temp files). */
  private async listProfileDocuments(): Promise<ProfileDocument[]> {
    const dir = this.resolve("sources");
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch (error: unknown) {
      if (isNotFound(error)) return [];
      throw error;
    }
    const docs: ProfileDocument[] = [];
    for (const name of names) {
      if (name.startsWith(".")) continue; // hidden + our temp files
      if (name.toLowerCase() === "readme.md") continue; // instructions, not a doc
      let stat;
      try {
        stat = await fs.stat(path.join(dir, name));
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      const dot = name.lastIndexOf(".");
      const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
      docs.push({
        name,
        ext,
        kind: profileDocumentKind(ext),
        sizeBytes: stat.size,
        modifiedMs: stat.mtimeMs,
      });
    }
    // Newest first — most-recently-added documents surface at the top.
    return docs.sort((a, b) => b.modifiedMs - a.modifiedMs);
  }

  /** Read a repo-root markdown file, or null when absent. */
  private async readRootText(name: string): Promise<string | null> {
    try {
      return await fs.readFile(this.resolve(name), "utf8");
    } catch (error: unknown) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** The long-form texts that feed the profile (cv, digest, voice, samples). */
  private async readProfileTexts(): Promise<ProfileTexts> {
    const [cv, articleDigest, voiceDna, sampleNames] = await Promise.all([
      this.readRootText("cv.md"),
      this.readRootText("article-digest.md"),
      this.readRootText("voice-dna.md"),
      fs.readdir(this.resolve("writing-samples")).catch((e: unknown) => {
        if (isNotFound(e)) return [] as string[];
        throw e;
      }),
    ]);
    const writingSamples: ProfileWritingSample[] = [];
    for (const name of sampleNames.sort()) {
      if (name.startsWith(".") || name.toLowerCase() === "readme.md") continue;
      if (!/\.(md|markdown|txt)$/i.test(name)) continue;
      try {
        const markdown = await fs.readFile(
          this.resolve("writing-samples", name),
          "utf8",
        );
        writingSamples.push({ name, markdown });
      } catch (error: unknown) {
        if (!isNotFound(error)) throw error;
      }
    }
    return { cv, articleDigest, voiceDna, writingSamples };
  }

  async getProfile(): Promise<ProfileData> {
    const [content, documents, texts] = await Promise.all([
      this.readRootProfileYaml(),
      this.listProfileDocuments(),
      this.readProfileTexts(),
    ]);
    return { profile: parseProfile(content), documents, texts };
  }

  /** Read config/profile.yml, or an empty document when it's absent. */
  private async readRootProfileYaml(): Promise<string> {
    try {
      return await fs.readFile(this.resolve("config", "profile.yml"), "utf8");
    } catch (error: unknown) {
      if (isNotFound(error)) return "";
      throw error;
    }
  }

  async updateProfileField(input: UpdateProfileFieldInput): Promise<Profile> {
    if (getConfig().readOnly) {
      throw new ProfileWriteError(
        "READ_ONLY",
        "READ_ONLY is set — all mutations are disabled.",
      );
    }
    return setProfileField(this.repoPath, input);
  }

  async addProfileDocument(
    filename: string,
    bytes: Uint8Array,
  ): Promise<ProfileDocument> {
    if (getConfig().readOnly) {
      throw new ProfileWriteError(
        "READ_ONLY",
        "READ_ONLY is set — all mutations are disabled.",
      );
    }
    return addProfileDocument(this.repoPath, filename, bytes);
  }

  async readProfileDocument(
    name: string,
  ): Promise<{ bytes: Uint8Array; ext: string } | null> {
    const dir = this.resolve("sources");
    const target = path.join(dir, name);
    // Never escape sources/: the resolved parent must equal sources/.
    if (
      name.includes("/") ||
      name.includes("\\") ||
      name.includes("..") ||
      path.dirname(path.resolve(target)) !== path.resolve(dir)
    ) {
      return null;
    }
    try {
      const bytes = await fs.readFile(target);
      const dot = name.lastIndexOf(".");
      const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
      return { bytes: new Uint8Array(bytes), ext };
    } catch (error: unknown) {
      if (isNotFound(error)) return null;
      throw error;
    }
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
