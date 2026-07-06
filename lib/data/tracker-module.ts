import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Bridge to the data repo's OWN tracker parsers. The tracker column layout is
 * header-aware and customizable (#946/#954/#1427); reimplementing it here
 * would drift. Instead we dynamically import `tracker-parse.mjs` /
 * `tracker-utils.mjs` straight from CAREER_OPS_PATH at runtime.
 *
 * The `webpackIgnore` comment keeps the bundler (webpack AND turbopack honor
 * it) from trying to resolve the runtime-computed specifier at build time.
 */

/** Row shape produced by `parseTrackerRow` in tracker-parse.mjs. */
export interface TrackerRow {
  num: number;
  date: string;
  company: string;
  role: string;
  score: string;
  status: string;
  pdf: string;
  report: string;
  notes: string;
  location?: string;
  raw: string;
}

export interface TrackerParseModule {
  resolveColumns(lines: string[]): Record<string, number>;
  parseTrackerRow(
    line: string,
    colmap?: Record<string, number>,
  ): TrackerRow | null;
  looksLikeScoreCell(value: string): boolean;
  resolveScoreStatus(
    a: string,
    b: string,
  ): { score: string; status: string } | null;
}

export interface TrackerUtilsModule {
  rebuildRow(parts: string[]): string;
}

const moduleCache = new Map<string, Promise<unknown>>();

async function importFrom<T>(repoPath: string, file: string): Promise<T> {
  const abs = path.join(repoPath, file);
  let cached = moduleCache.get(abs);
  if (!cached) {
    const url = pathToFileURL(abs).href;
    cached = import(/* webpackIgnore: true */ url).catch((cause: unknown) => {
      moduleCache.delete(abs);
      throw new Error(
        `career-ops-web: failed to load ${file} from CAREER_OPS_PATH (${repoPath}). ` +
          "Is CAREER_OPS_PATH pointing at a career-ops repo?",
        { cause },
      );
    });
    moduleCache.set(abs, cached);
  }
  return (await cached) as T;
}

export function loadTrackerParse(repoPath: string): Promise<TrackerParseModule> {
  return importFrom<TrackerParseModule>(repoPath, "tracker-parse.mjs");
}

export function loadTrackerUtils(repoPath: string): Promise<TrackerUtilsModule> {
  return importFrom<TrackerUtilsModule>(repoPath, "tracker-utils.mjs");
}
