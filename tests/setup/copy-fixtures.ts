/**
 * Vitest global setup — prepares filesystem fixtures WITHOUT ever touching the
 * real data repo (read + copy only, never write into it).
 *
 * 1. Copies the data repo's own parser modules (tracker-parse.mjs,
 *    tracker-utils.mjs) into each fixture dir, because FsDataSource loads them
 *    from the repo root it is pointed at. Copies are gitignored.
 * 2. Snapshots the real applications.md + states.yml into the gitignored
 *    tests/fixtures/real/ dir so tests never mutate (or even read twice) the
 *    live files mid-run.
 *
 * When CAREER_OPS_PATH is not set (e.g. CI without the private repo), nothing
 * is copied and the dependent suites skip themselves.
 */
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { isReportFile } from "@/lib/parsers/report";

const WEB_ROOT = process.cwd();
const FIXTURES = path.join(WEB_ROOT, "tests", "fixtures");
const SYNTHETIC_DIRS = [
  path.join(FIXTURES, "synthetic"),
  path.join(FIXTURES, "synthetic-location"),
];
const REAL_DIR = path.join(FIXTURES, "real");
// tracker-parse.mjs loads tracker-aliases.json from its own directory, so the
// JSON must land beside it in every fixture repo or the parser throws ENOENT.
const PARSER_FILES = ["tracker-parse.mjs", "tracker-utils.mjs", "tracker-aliases.json"];

export default async function setup(): Promise<void> {
  // Vitest does not load Next's .env.local — pull CAREER_OPS_PATH from it.
  if (!process.env.CAREER_OPS_PATH) {
    try {
      process.loadEnvFile(path.join(WEB_ROOT, ".env.local"));
    } catch {
      // no .env.local — fall through to the env-only path
    }
  }
  const repo = process.env.CAREER_OPS_PATH?.trim();
  if (!repo || !existsSync(repo)) {
    console.warn(
      "[fixtures] CAREER_OPS_PATH not set or missing — FsDataSource suites will be skipped.",
    );
    await rm(REAL_DIR, { recursive: true, force: true });
    return;
  }

  // Parser modules → every fixture repo layout.
  for (const dir of [...SYNTHETIC_DIRS, REAL_DIR]) {
    await mkdir(dir, { recursive: true });
    for (const file of PARSER_FILES) {
      await copyFile(path.join(repo, file), path.join(dir, file));
    }
  }

  // Real-data snapshot (gitignored — real companies/notes must never be committed).
  await mkdir(path.join(REAL_DIR, "data"), { recursive: true });
  await mkdir(path.join(REAL_DIR, "templates"), { recursive: true });
  await copyFile(
    path.join(repo, "data", "applications.md"),
    path.join(REAL_DIR, "data", "applications.md"),
  );
  await copyFile(
    path.join(repo, "templates", "states.yml"),
    path.join(REAL_DIR, "templates", "states.yml"),
  );

  // M3 report-parser fixtures: snapshot every report (read-only copy).
  const reportsDir = path.join(repo, "reports");
  const realReports = path.join(REAL_DIR, "reports");
  await rm(realReports, { recursive: true, force: true });
  await mkdir(realReports, { recursive: true });
  if (existsSync(reportsDir)) {
    for (const file of await readdir(reportsDir)) {
      // Skip reservation sentinels (NNN-RESERVED.md) — they're not reports.
      if (!isReportFile(file)) continue;
      await copyFile(path.join(reportsDir, file), path.join(realReports, file));
    }
  }

  // Follow-ups + pdf-index snapshots (optional files).
  for (const rel of [
    path.join("data", "follow-ups.md"),
    path.join("data", "pdf-index.tsv"),
  ]) {
    const src = path.join(repo, rel);
    if (existsSync(src)) await copyFile(src, path.join(REAL_DIR, rel));
  }

  // Documents heuristics need the output/ file LIST only (PDFs stay put).
  const outputDir = path.join(repo, "output");
  const outputFiles = existsSync(outputDir) ? await readdir(outputDir) : [];
  await writeFile(
    path.join(REAL_DIR, "output-files.json"),
    JSON.stringify(outputFiles, null, 2),
  );
}
