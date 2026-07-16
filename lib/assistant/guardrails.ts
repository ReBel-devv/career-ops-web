/**
 * Hard, non-bypassable guardrails for the embedded assistant (ASSISTANT-PLAN §3).
 *
 * These are enforced via a `PreToolUse` hook — which runs *before* everything,
 * even under `bypassPermissions`/autonomous mode — plus a scoped `disallowedTools`
 * belt-and-suspenders. `canUseTool` is NOT a security boundary (it is
 * short-circuited for auto-approved tools), so the real containment lives here.
 *
 * The module is intentionally pure (no I/O) so it can be unit-tested exhaustively.
 */
import { realpathSync } from "node:fs";
import path from "node:path";

export interface GuardVerdict {
  ok: boolean;
  /** Present when `ok` is false — a user-facing reason for the denial. */
  reason?: string;
}

const OK: GuardVerdict = { ok: true };

/** Mutating tools whose primary path argument must stay inside the repo. */
const WRITE_PATH_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/**
 * Read tools are auto-approved (no confirmation card), so their paths must be
 * confined too — otherwise the agent could silently read `~/.ssh`, `~/.aws`,
 * browser profiles, … (security review 2026-07-16).
 */
const READ_PATH_TOOLS = new Set(["Read", "Grep", "Glob", "NotebookRead"]);

/**
 * Resolve symlinks on the deepest EXISTING ancestor of `p`, then re-append the
 * non-existing remainder. Defeats the `ln -s /outside repo/esc` + write-through
 * escape: the lexical path looks in-repo but the real path is not. Falls back
 * to the lexical path when nothing exists (e.g. unit tests with fake roots).
 */
function resolveReal(p: string): string {
  let base = p;
  let suffix = "";
  for (;;) {
    try {
      const real = realpathSync(base);
      return suffix ? path.join(real, suffix) : real;
    } catch {
      const parent = path.dirname(base);
      if (parent === base) return p; // nothing on disk — lexical fallback
      suffix = suffix ? path.join(path.basename(base), suffix) : path.basename(base);
      base = parent;
    }
  }
}

/**
 * Resolve a tool's target path against the repo root and confirm it stays
 * inside it — symlinks resolved on both sides. Absolute paths must already be
 * within the repo; relative paths resolve against the root (the SDK `cwd`).
 * `..` escapes, symlink escapes, `.git/` internals and `.env*` files are refused.
 */
export function checkPathWithinRepo(repoRoot: string, target: string): GuardVerdict {
  if (!repoRoot) return { ok: false, reason: "No repository root is configured." };
  if (!target) return { ok: false, reason: "Missing file path." };

  const root = resolveReal(path.resolve(repoRoot));
  const lexical = path.isAbsolute(target)
    ? path.resolve(target)
    : path.resolve(root, target);
  const resolved = resolveReal(lexical);

  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, reason: `Path escapes the career-ops repo: ${target}` };
  }
  if (rel.split(path.sep)[0] === ".git") {
    return { ok: false, reason: "Touching .git internals is not allowed." };
  }
  if (path.basename(resolved).startsWith(".env")) {
    return { ok: false, reason: "Reading or writing .env files is not allowed." };
  }
  return OK;
}

/** Denylisted bash patterns (matched against the raw command string). */
const BASH_DENY: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bgit\s+push\b/, reason: "git push is never allowed." },
  {
    // `git -C <dir> push`, `git --git-dir=… push`, `git -c k=v push` variants.
    pattern: /\bgit\s+(?:-C\s+\S+|-c\s+\S+|--git-dir(?:=|\s+)\S+|--work-tree(?:=|\s+)\S+)[^\n|;&]*\bpush\b/,
    reason: "git push is never allowed.",
  },
  { pattern: /\bsudo\b/, reason: "sudo is not allowed." },
  {
    // rm with both recursive and force (in any flag arrangement), or -rf/-fr.
    pattern: /\brm\s+(?:-\S*\s+)*-\S*(?:rf|fr)\S*|\brm\s+(?:-\S*r\S*\s+-\S*f|-\S*f\S*\s+-\S*r)/i,
    reason: "Recursive force-delete (rm -rf) is not allowed.",
  },
  {
    // Piping a network fetch straight into a shell.
    pattern: /\b(?:curl|wget|fetch)\b[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh)\b/i,
    reason: "Piping a download into a shell is not allowed.",
  },
  {
    // Uploading data out (exfiltration): curl/wget with a body/upload flag.
    pattern: /\bcurl\b[^\n]*\s(?:-d|--data(?:-\w+)?|-F|--form|-T|--upload-file)\b|\bwget\b[^\n]*--post-(?:data|file)\b/,
    reason: "Uploading data with curl/wget is not allowed.",
  },
  { pattern: /\.git\/config\b/, reason: "Modifying .git/config is not allowed." },
  {
    pattern: /\bgit\s+config\b[^\n]*--(?:global|system)\b/,
    reason: "Editing global/system git config is not allowed.",
  },
  // Secret-bearing locations & environment dumps (exfiltration surface).
  { pattern: /(?:^|[\s"'/~])\.ssh\b/, reason: "Touching ~/.ssh is not allowed." },
  { pattern: /(?:^|[\s"'/~])\.aws\b/, reason: "Touching ~/.aws is not allowed." },
  { pattern: /(?:^|[\s"'/])\.env\b/, reason: "Touching .env files is not allowed." },
  { pattern: /\bprintenv\b/, reason: "Dumping the environment is not allowed." },
  {
    pattern: /\$\{?(?:ANTHROPIC|CLAUDE)[A-Z_]*/i,
    reason: "Reading auth-related environment variables is not allowed.",
  },
  {
    // macOS keychain extraction.
    pattern: /\bsecurity\s+(?:find|dump)[\w-]*/,
    reason: "Reading the system keychain is not allowed.",
  },
];

/**
 * Inspect `>`/`>>` redirections and refuse any that write outside the repo.
 * File-descriptor redirections (`>&2`, `2>&1`) and `/dev/*` sinks are ignored.
 */
function checkRedirects(command: string, repoRoot: string): GuardVerdict {
  const re = />>?\s*("[^"]+"|'[^']+'|[^\s;&|<>]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(command)) !== null) {
    const target = match[1].replace(/^["']|["']$/g, "");
    if (target.startsWith("/dev/")) continue;
    // `~/…` and `$VAR/…` expand at run time to paths we cannot resolve here —
    // refuse rather than guess (they are how homedir escapes are written).
    if (target.startsWith("~") || target.includes("$")) {
      return { ok: false, reason: `Redirect target cannot be verified: ${target}` };
    }
    const verdict = checkPathWithinRepo(repoRoot, target);
    if (!verdict.ok) {
      return { ok: false, reason: `Redirected write escapes the repo: ${target}` };
    }
  }
  return OK;
}

/** Evaluate a bash command against the denylist and redirection confinement. */
export function checkBashCommand(command: string, repoRoot: string): GuardVerdict {
  const cmd = command ?? "";
  for (const { pattern, reason } of BASH_DENY) {
    if (pattern.test(cmd)) return { ok: false, reason };
  }
  return checkRedirects(cmd, repoRoot);
}

/**
 * The single entry point used by the `PreToolUse` hook. Returns `ok: false`
 * with a reason for anything that must be hard-denied; `ok: true` otherwise
 * (read-only tools and non-mutating actions fall through to normal permission
 * handling / confirmation).
 */
export function checkToolUse(args: {
  toolName: string;
  toolInput: Record<string, unknown>;
  repoRoot: string;
}): GuardVerdict {
  const { toolName, toolInput, repoRoot } = args;

  if (toolName === "Bash") {
    const command = typeof toolInput.command === "string" ? toolInput.command : "";
    return checkBashCommand(command, repoRoot);
  }

  if (WRITE_PATH_TOOLS.has(toolName)) {
    const raw = toolInput.file_path ?? toolInput.notebook_path ?? toolInput.path;
    if (typeof raw !== "string" || !raw) {
      return { ok: false, reason: "Missing file path." };
    }
    return checkPathWithinRepo(repoRoot, raw);
  }

  if (READ_PATH_TOOLS.has(toolName)) {
    // Path is optional for Grep/Glob (defaults to cwd = the repo); when present
    // it must stay inside the repo — reads are auto-approved, so this is the
    // only gate between the agent and files like ~/.ssh or a stray .env.
    const raw = toolInput.file_path ?? toolInput.notebook_path ?? toolInput.path;
    if (raw === undefined || raw === null || raw === "") return OK;
    if (typeof raw !== "string") return { ok: false, reason: "Invalid path." };
    return checkPathWithinRepo(repoRoot, raw);
  }

  return OK;
}

/**
 * Scoped hard-deny rules, mirrored into the SDK `disallowedTools` option as a
 * second layer behind the hook. Prefix matching per Claude Code's rule syntax.
 */
export const DISALLOWED_TOOLS: readonly string[] = [
  "Bash(git push:*)",
  "Bash(sudo:*)",
];
