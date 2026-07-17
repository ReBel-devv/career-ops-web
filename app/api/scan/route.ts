import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getConfig, requireCareerOpsPath } from "@/lib/config";
import { readOnlyGuard } from "@/lib/api/follow-up-error";

// Living data — never cache.
export const dynamic = "force-dynamic";

/**
 * POST /api/scan — run the zero-token portal scanner (`node scan.mjs`, no
 * `--verify`: the Playwright pass is minutes-long CLI territory). One scan at
 * a time; the summary comes from the run's own `data/scan-runs.tsv` row —
 * structured by contract — rather than parsing the human stdout.
 *
 * GET /api/scan — `{ running }`, so the Discovery button can re-attach to an
 * in-flight scan after a page reload.
 */

/** ~5 min kill switch — a plain HTTP scan finishing later than this is stuck. */
const SCAN_TIMEOUT_MS = 5 * 60_000;

export interface ScanRunSummary {
  timestamp: string;
  status: string;
  companies: number;
  boards: number;
  found: number;
  dupes: number;
  newAdded: number;
  errors: number;
}

// Survives dev HMR module reloads — same trick as a prisma-style global.
const globalScan = globalThis as typeof globalThis & {
  __careerOpsScanRunning?: boolean;
};

/**
 * Last `data/scan-runs.tsv` row as a summary, or null when the file is absent
 * or the newest row predates `notBefore` (the scan wrote nothing).
 */
async function readLastScanRun(
  repoPath: string,
  notBefore: number,
): Promise<ScanRunSummary | null> {
  let raw: string;
  try {
    raw = await fs.readFile(
      path.join(repoPath, "data", "scan-runs.tsv"),
      "utf8",
    );
  } catch {
    return null;
  }
  const lines = raw.trim().split("\n");
  if (lines.length < 2) return null;

  // Resolve columns by header name — the file format appends new columns at
  // the end, so positional parsing would break on older/newer files.
  const header = lines[0].split("\t");
  const cells = lines[lines.length - 1].split("\t");
  const cell = (name: string): string => {
    const i = header.indexOf(name);
    return i >= 0 ? (cells[i] ?? "") : "";
  };
  const num = (name: string): number => {
    const n = Number.parseInt(cell(name), 10);
    return Number.isFinite(n) ? n : 0;
  };

  const timestamp = cell("timestamp");
  // 60s skew tolerance: the row's timestamp may be taken before our start.
  if (!timestamp || Date.parse(timestamp) < notBefore - 60_000) return null;

  return {
    timestamp,
    status: cell("status") || "completed",
    companies: num("companies"),
    boards: num("boards"),
    found: num("found"),
    dupes: num("dupes"),
    newAdded: num("new_added"),
    errors: num("errors"),
  };
}

/** Run `node scan.mjs` in the data repo; resolves with the exit diagnostics. */
function runScan(
  repoPath: string,
): Promise<{ code: number | null; tail: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scan.mjs"], {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Keep only the output tail — enough to diagnose, bounded in memory.
    let tail = "";
    const append = (chunk: Buffer) => {
      tail = (tail + chunk.toString("utf8")).slice(-4_000);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(`Scan timed out after ${SCAN_TIMEOUT_MS / 60_000} minutes.`),
      );
    }, SCAN_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, tail });
    });
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    running: globalScan.__careerOpsScanRunning === true,
  });
}

export async function POST(): Promise<NextResponse> {
  const guard = readOnlyGuard();
  if (guard) return guard;
  if (getConfig().demoMode) {
    return NextResponse.json(
      {
        error:
          "Scanning is unavailable in demo mode — it needs a local data repo.",
      },
      { status: 403 },
    );
  }
  if (globalScan.__careerOpsScanRunning) {
    return NextResponse.json(
      { error: "A scan is already running." },
      { status: 409 },
    );
  }

  const repoPath = requireCareerOpsPath();
  const startedAt = Date.now();
  globalScan.__careerOpsScanRunning = true;
  try {
    const { code, tail } = await runScan(repoPath);
    if (code !== 0) {
      const detail = tail.trim().split("\n").slice(-5).join("\n");
      return NextResponse.json(
        { error: `scan.mjs exited with code ${code}.`, detail },
        { status: 500 },
      );
    }
    const summary = await readLastScanRun(repoPath, startedAt);
    return NextResponse.json({ summary });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    globalScan.__careerOpsScanRunning = false;
  }
}
