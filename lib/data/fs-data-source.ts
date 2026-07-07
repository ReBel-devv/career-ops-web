import { promises as fs } from "node:fs";
import path from "node:path";
import {
  applicationSchema,
  buildStatusResolver,
  parsePdfCell,
  parseReportCell,
  parseScoreCell,
  scanRecordSchema,
  type Application,
  type CanonicalState,
  type FollowUpData,
  type PipelineItem,
  type Report,
  type ScanRecord,
  type UpdateApplicationInput,
  type UpdateApplicationResult,
} from "@/lib/domain";
import { getConfig } from "@/lib/config";
import { runFollowupSeed, runTrackerSync } from "@/lib/scripts";
import { TrackerWriteError, writeTrackerCell } from "@/lib/writers";
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

  // TODO(M3): parse report header + Machine Summary YAML + markdown body.
  async getReport(_num: number): Promise<Report | null> {
    return null;
  }

  // TODO(M4): parse follow-ups table + `- next #N …` pins.
  async getFollowUps(): Promise<FollowUpData> {
    return { logs: [], pins: [] };
  }

  // TODO(M5): parse pipeline.md Pending/Processed sections.
  async getPipelineItems(): Promise<PipelineItem[]> {
    return [];
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
