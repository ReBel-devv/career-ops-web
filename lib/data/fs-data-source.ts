import { promises as fs } from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import {
  applicationSchema,
  buildStatusResolver,
  parsePdfCell,
  parseReportCell,
  parseScoreCell,
  scanRecordSchema,
  statesFileSchema,
  type Application,
  type CanonicalState,
  type FollowUpData,
  type PipelineItem,
  type Report,
  type ScanRecord,
} from "@/lib/domain";
import type { DataSource } from "./data-source";
import { loadTrackerParse, type TrackerRow } from "./tracker-module";

/**
 * Reads the real career-ops data repo. Column mapping and row parsing are
 * delegated to the repo's own `tracker-parse.mjs` (never reimplemented);
 * states.yml is parsed at request time; every boundary is zod-validated.
 * Strictly read-only in M0.
 */
export class FsDataSource implements DataSource {
  constructor(private readonly repoPath: string) {}

  private resolve(...segments: string[]): string {
    return path.join(this.repoPath, ...segments);
  }

  async getStates(): Promise<CanonicalState[]> {
    const raw = await fs.readFile(this.resolve("templates", "states.yml"), "utf8");
    const doc: unknown = loadYaml(raw);
    return statesFileSchema.parse(doc).states;
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
