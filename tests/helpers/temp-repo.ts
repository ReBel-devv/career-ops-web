/**
 * Builds throwaway career-ops repo layouts in the OS temp dir so writer
 * tests NEVER touch the real data repo. The real repo is only ever read
 * (tracker snapshot, states.yml, and its own .mjs scripts are copied in).
 *
 * The copied scripts resolve their repo root from `import.meta.url`, so a
 * copy placed at the temp root operates entirely inside the temp repo:
 * - verify-pipeline.mjs — self-contained (node builtins only).
 * - followup-seed.mjs   — imports ./tracker-parse.mjs + ./followup-cadence.mjs
 *   (which imports js-yaml) → both are copied and node_modules is symlinked
 *   read-only from the data repo.
 */
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const SCRIPT_FILES = [
  "tracker-parse.mjs",
  // tracker-parse.mjs loads this JSON from its own dir — must sit beside it.
  "tracker-aliases.json",
  "tracker-utils.mjs",
  "verify-pipeline.mjs",
  "followup-seed.mjs",
  "followup-cadence.mjs",
];

/** CAREER_OPS_PATH from env or .env.local; null → dependent suites skip. */
export function dataRepoPath(): string | null {
  if (!process.env.CAREER_OPS_PATH) {
    try {
      process.loadEnvFile(path.join(process.cwd(), ".env.local"));
    } catch {
      // no .env.local — fall through
    }
  }
  const repo = process.env.CAREER_OPS_PATH?.trim();
  return repo && existsSync(repo) ? repo : null;
}

export interface TempRepo {
  root: string;
  trackerPath: string;
  cleanup(): Promise<void>;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Create stub report files so verify-pipeline's link check passes. */
async function stubReports(root: string, trackerContent: string): Promise<void> {
  const trackerDir = path.join(root, "data");
  for (const line of trackerContent.split("\n")) {
    if (!line.startsWith("|")) continue;
    const match = /\]\(([^)]+)\)/.exec(line);
    if (!match) continue;
    const target = path.resolve(trackerDir, match[1]);
    if (!isInside(target, root)) continue; // never escape the temp repo
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "# stub report (test fixture)\n");
  }
}

/**
 * Build a temp repo with the given tracker content. `states.yml` and the
 * scripts are copied from the real data repo (read-only source).
 */
export async function createTempRepo(
  dataRepo: string,
  trackerContent: string,
): Promise<TempRepo> {
  const root = await mkdtemp(path.join(tmpdir(), "career-ops-writer-test-"));
  await mkdir(path.join(root, "data"), { recursive: true });
  await mkdir(path.join(root, "templates"), { recursive: true });
  await mkdir(path.join(root, "reports"), { recursive: true });

  const trackerPath = path.join(root, "data", "applications.md");
  await writeFile(trackerPath, trackerContent);
  await copyFile(
    path.join(dataRepo, "templates", "states.yml"),
    path.join(root, "templates", "states.yml"),
  );
  for (const file of SCRIPT_FILES) {
    await copyFile(path.join(dataRepo, file), path.join(root, file));
  }
  // js-yaml for followup-cadence.mjs — read-only symlink, nothing installed.
  await symlink(
    path.join(dataRepo, "node_modules"),
    path.join(root, "node_modules"),
    "dir",
  );
  await stubReports(root, trackerContent);

  return {
    root,
    trackerPath,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

/** Read the real tracker once (read-only) for golden/round-trip fixtures. */
export async function readRealTracker(dataRepo: string): Promise<string> {
  return readFile(path.join(dataRepo, "data", "applications.md"), "utf8");
}

/** The committed synthetic tracker (invented companies, canonical layout). */
export const SYNTHETIC_TRACKER = [
  "# Applications Tracker",
  "",
  "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
  "|---|------|---------|------|-------|--------|-----|--------|-------|",
  "| 1 | 2026-06-01 | Nimbus Labs | Design Engineer | 4.4/5 | Applied | ✅ | [001](../reports/001-nimbus-labs-2026-06-01.md) | Strong archetype match. |",
  "| 2 | 2026-06-02 | Vectorline | Frontend Engineer | 3.1/5 | Evaluated | ❌ | [002](../reports/002-vectorline-2026-06-02.md) | Platform emphasis is a slight mismatch. |",
  "| 3 | 2026-06-03 | Acme Intelligence | Fullstack Engineer | N/A | SKIP | ❌ | [003](../reports/003-acme-intelligence-2026-06-03.md) | Sentinel score row. |",
  "",
].join("\n");
