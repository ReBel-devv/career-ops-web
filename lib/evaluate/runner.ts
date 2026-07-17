import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { DEFAULT_MODEL } from "@/lib/assistant/config";
import { checkToolUse, DISALLOWED_TOOLS } from "@/lib/assistant/guardrails";
import type { HookInput } from "@anthropic-ai/claude-agent-sdk";

/**
 * Server-side evaluation jobs — "Evaluate" buttons on the Discovery inbox.
 *
 * Each offer runs the repo's own headless single-offer worker contract
 * (`batch/batch-prompt.md`, the same prompt `batch/batch-runner.sh` feeds to
 * `claude -p` workers) through the Claude Agent SDK — same engine and auth as
 * the embedded assistant. Placeholders are resolved exactly like the runner
 * does (URL / JD file / report number / date / id + appended user-layer
 * personalization), plus a dashboard-specific addendum for `data/pipeline.md`
 * bookkeeping, which the batch flow doesn't handle (its inbox is
 * batch-input.tsv).
 *
 * One job at a time, sequential within a job (bulk = "evaluate next N"). The
 * job runs detached from the request; the route's GET exposes this state and
 * the client polls. In-memory only: a dev-server restart forgets the job (the
 * worker dies with the process — nothing keeps running unobserved).
 */

const execFileAsync = promisify(execFile);

/** Per-offer wall-clock budget — evaluation + report + optional PDF. */
const OFFER_TIMEOUT_MS = 10 * 60_000;
/** Turn budget per worker — a runaway agent is cut well before the clock. */
const MAX_TURNS = 150;

export interface EvaluateTarget {
  url: string;
  /** `local:jds/…` reference carried by manual `[!]` items, when present. */
  localJd: string | null;
}

export interface EvaluationResult {
  url: string;
  status: "completed" | "discarded" | "failed";
  company: string | null;
  role: string | null;
  score: number | null;
  reportNum: string | null;
  error: string | null;
}

export interface EvaluationJobState {
  running: boolean;
  /** URL currently being evaluated, null between offers / when idle. */
  current: string | null;
  /** URLs waiting behind the current one. */
  queued: string[];
  /** Finished offers, oldest first — grows as the job progresses. */
  results: EvaluationResult[];
  startedAt: string | null;
  finishedAt: string | null;
}

const IDLE: EvaluationJobState = {
  running: false,
  current: null,
  queued: [],
  results: [],
  startedAt: null,
  finishedAt: null,
};

// Survives dev HMR module reloads (same pattern as the scan route).
const globalJob = globalThis as typeof globalThis & {
  __careerOpsEvaluation?: EvaluationJobState;
};

export function getEvaluationState(): EvaluationJobState {
  return globalJob.__careerOpsEvaluation ?? IDLE;
}

/** The dashboard-only extension to the batch worker contract. */
function pipelineAddendum(target: EvaluateTarget): string {
  return [
    "",
    "---",
    "",
    "## Dashboard addendum — data/pipeline.md bookkeeping (REQUIRED)",
    "",
    "This offer comes from the `data/pipeline.md` Pending inbox, not from",
    "batch-input.tsv. After the tracker TSV line is written (or the offer is",
    "discarded), update `data/pipeline.md`:",
    "- On a completed evaluation: move the pending entry for {{URL}} from",
    '  "Pending" to "Processed" as',
    "  `- [x] #NNN | URL | Company | Role | Score/5 | PDF ✅/❌`.",
    '- On a pre-screen discard: move it to "Processed" as',
    "  `- [x] #-- | {{URL}} | skipped (pre-screen mismatch: {reason})`.",
    "- On failure: leave the entry in Pending untouched.",
    ...(target.localJd
      ? [
          "",
          "This is a manual entry with a local JD: read the JD from",
          `\`${target.localJd.replace(/^local:/, "")}\` (repo-relative) instead of fetching the URL,`,
          "and copy its content into the JD file path you were given.",
        ]
      : []),
    "",
  ].join("\n");
}

/** Resolve batch-prompt.md the way batch-runner.sh does, plus our addendum. */
async function buildWorkerSystemPrompt(
  repoPath: string,
  vars: {
    url: string;
    jdFile: string;
    reportNum: string;
    date: string;
    id: string;
  },
  target: EvaluateTarget,
): Promise<string> {
  const template = await fs.readFile(
    path.join(repoPath, "batch", "batch-prompt.md"),
    "utf8",
  );
  let resolved = template
    .replaceAll("{{URL}}", vars.url)
    .replaceAll("{{JD_FILE}}", vars.jdFile)
    .replaceAll("{{REPORT_NUM}}", vars.reportNum)
    .replaceAll("{{DATE}}", vars.date)
    .replaceAll("{{ID}}", vars.id);

  resolved += pipelineAddendum(target).replaceAll("{{URL}}", vars.url);

  // Runtime personalization — same files, same shape as batch-runner.sh.
  for (const rel of [
    "modes/_profile.md",
    "config/profile.yml",
    "modes/_custom.md",
  ]) {
    let content: string;
    try {
      content = await fs.readFile(path.join(repoPath, rel), "utf8");
    } catch {
      continue;
    }
    const indented = content
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n");
    resolved += `\n\n---\n\n## Runtime personalization: ${rel}\n\n${indented}\n`;
  }
  return resolved;
}

/** Extract the worker's final JSON payload from its closing message. */
export function parseWorkerResult(text: string): {
  status: string;
  company: string | null;
  role: string | null;
  score: number | null;
  reportNum: string | null;
  error: string | null;
} | null {
  const candidates: string[] = [];
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(
    (m) => m[1],
  );
  candidates.push(...fenced.reverse());
  const brace = text.slice(text.lastIndexOf("{"));
  if (brace.length > 1) candidates.push(brace);
  const wide = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (wide.length > 1) candidates.push(wide);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      if (typeof parsed.status !== "string") continue;
      return {
        status: parsed.status,
        company: typeof parsed.company === "string" ? parsed.company : null,
        role: typeof parsed.role === "string" ? parsed.role : null,
        score: typeof parsed.score === "number" ? parsed.score : null,
        reportNum:
          typeof parsed.report_num === "string" ||
          typeof parsed.report_num === "number"
            ? String(parsed.report_num)
            : null,
        error: typeof parsed.error === "string" ? parsed.error : null,
      };
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** PreToolUse guard — the assistant's unbypassable guardrails, verbatim. */
function preToolUseGuard(repoRoot: string) {
  return async (input: HookInput) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const verdict = checkToolUse({
      toolName: input.tool_name,
      toolInput: (input.tool_input ?? {}) as Record<string, unknown>,
      repoRoot,
    });
    if (verdict.ok) return {};
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "deny" as const,
        permissionDecisionReason: verdict.reason ?? "Blocked by a guardrail.",
      },
    };
  };
}

async function runNodeScript(
  repoPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, args, {
    cwd: repoPath,
    timeout: 60_000,
  });
}

/** Evaluate one offer through the SDK worker. Never throws. */
async function evaluateOne(
  repoPath: string,
  target: EvaluateTarget,
): Promise<EvaluationResult> {
  const failed = (error: string): EvaluationResult => ({
    url: target.url,
    status: "failed",
    company: null,
    role: null,
    score: null,
    reportNum: null,
    error,
  });

  // Atomic report-number claim — never compute max+1 (the #749 race).
  let reportNum: string;
  try {
    const { stdout } = await runNodeScript(repoPath, [
      "reserve-report-num.mjs",
    ]);
    reportNum = stdout.trim().split("\n").pop()?.trim() ?? "";
    if (!/^\d{3,}$/.test(reportNum)) {
      return failed(`reserve-report-num.mjs returned "${reportNum}"`);
    }
  } catch (err) {
    return failed(
      `Could not reserve a report number: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const id = `web-${Date.now()}`;
  let jdFile: string | null = null;
  try {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "career-ops-jd-"));
    jdFile = path.join(dir, `${reportNum}.txt`);
    await fs.writeFile(jdFile, "", "utf8");

    const systemPrompt = await buildWorkerSystemPrompt(
      repoPath,
      {
        url: target.url,
        jdFile,
        reportNum,
        date: new Date().toISOString().slice(0, 10),
        id,
      },
      target,
    );

    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), OFFER_TIMEOUT_MS);

    let finalText = "";
    try {
      const stream = query({
        prompt:
          "Process this job offer. Run the full pipeline: A-G evaluation + " +
          `report .md + optional PDF + tracker line. URL: ${target.url} ` +
          `JD file: ${jdFile} Report number: ${reportNum} ` +
          `Date: ${new Date().toISOString().slice(0, 10)} Batch ID: ${id}`,
        options: {
          cwd: repoPath,
          model: DEFAULT_MODEL,
          effort: "medium",
          abortController: abort,
          settingSources: [],
          env: { ...process.env },
          systemPrompt,
          maxTurns: MAX_TURNS,
          // Headless worker: autonomous by design (the batch contract), with
          // the assistant's hard guardrails as the unbypassable outer layer.
          permissionMode: "bypassPermissions",
          disallowedTools: [...DISALLOWED_TOOLS],
          hooks: { PreToolUse: [{ hooks: [preToolUseGuard(repoPath)] }] },
        },
      });

      for await (const msg of stream) {
        if (msg.type === "result") {
          if (msg.subtype === "success" && typeof msg.result === "string") {
            finalText = msg.result;
          } else if (msg.subtype !== "success") {
            return failed(`The worker run failed (${msg.subtype}).`);
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
    if (abort.signal.aborted) {
      return failed(
        `Evaluation timed out after ${OFFER_TIMEOUT_MS / 60_000} minutes.`,
      );
    }

    const parsed = parseWorkerResult(finalText);
    if (!parsed)
      return failed("The worker's final JSON summary could not be parsed.");

    // Canonical rule: merge tracker additions after evaluations.
    if (parsed.status === "completed") {
      try {
        await runNodeScript(repoPath, ["merge-tracker.mjs"]);
      } catch (err) {
        // The TSV stays in batch/tracker-additions/ — a later merge picks it up.
        console.error("merge-tracker.mjs failed after evaluation:", err);
      }
    }

    return {
      url: target.url,
      status:
        parsed.status === "completed"
          ? "completed"
          : parsed.status === "discarded"
            ? "discarded"
            : "failed",
      company: parsed.company,
      role: parsed.role,
      score: parsed.score,
      reportNum:
        parsed.status === "completed" ? (parsed.reportNum ?? reportNum) : null,
      error: parsed.error,
    };
  } catch (err) {
    return failed(err instanceof Error ? err.message : String(err));
  } finally {
    // Release the sentinel; discarded/failed numbers become harmless gaps.
    try {
      await runNodeScript(repoPath, [
        "reserve-report-num.mjs",
        "--release",
        reportNum,
      ]);
    } catch {
      // Stale sentinels are GC'd after 4h — never block on cleanup.
    }
    if (jdFile)
      void fs.rm(path.dirname(jdFile), { recursive: true, force: true });
  }
}

/**
 * Start a job for `targets` (already validated as pending-with-URL). Returns
 * false when a job is already running.
 */
export function startEvaluationJob(
  repoPath: string,
  targets: EvaluateTarget[],
): boolean {
  const state = getEvaluationState();
  if (state.running) return false;

  globalJob.__careerOpsEvaluation = {
    running: true,
    current: null,
    queued: targets.map((t) => t.url),
    results: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  // Detached from the request on purpose — the client polls GET for progress.
  void (async () => {
    const job = globalJob.__careerOpsEvaluation;
    if (!job) return;
    try {
      for (const target of targets) {
        job.queued = job.queued.filter((u) => u !== target.url);
        job.current = target.url;
        const result = await evaluateOne(repoPath, target);
        job.results.push(result);
        job.current = null;
      }
    } finally {
      job.running = false;
      job.current = null;
      job.queued = [];
      job.finishedAt = new Date().toISOString();
    }
  })();

  return true;
}
