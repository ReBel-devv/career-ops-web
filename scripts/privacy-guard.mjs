#!/usr/bin/env node
/**
 * Privacy guard (plan §7, CI gate): fails when any COMMITTED file contains a
 * token whose sha256 matches the hashed blocklist generated from the private
 * data repo (user identity, real tracker companies, report slugs).
 *
 *   node scripts/privacy-guard.mjs             # scan `git ls-files`
 *   node scripts/privacy-guard.mjs --staged    # scan staged files only
 *   node scripts/privacy-guard.mjs --blocklist <file> --dir <dir>  # testable
 *
 * Exit 0 = clean, 1 = leak found (offending file + a REDACTED token hint are
 * printed — never the token itself), 2 = usage/setup error.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractBigrams, extractTokens, hashToken } from "./privacy-lib.mjs";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

const blocklistPath =
  argValue("--blocklist") ?? path.join(WEB_ROOT, "scripts", "privacy-blocklist.json");
const scanDir = argValue("--dir") ?? WEB_ROOT;
const staged = args.includes("--staged");

if (!existsSync(blocklistPath)) {
  console.error(`privacy-guard: blocklist not found at ${blocklistPath}`);
  process.exit(2);
}
const { hashes } = JSON.parse(readFileSync(blocklistPath, "utf8"));
const blocked = new Set(hashes);
if (blocked.size === 0) {
  console.error("privacy-guard: blocklist is empty — refusing to pass vacuously.");
  process.exit(2);
}

/** Files to scan: committed (or staged) text files. Binary + lockfile skipped. */
const SKIP_RE = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|pdf|zip)$/i;
const SKIP_FILES = new Set(["pnpm-lock.yaml"]);

function listFiles() {
  const out = execFileSync(
    "git",
    staged ? ["diff", "--name-only", "--cached"] : ["ls-files"],
    { cwd: scanDir, encoding: "utf8" },
  );
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter(
      (f) =>
        f !== "" &&
        !SKIP_RE.test(f) &&
        !SKIP_FILES.has(path.basename(f)) &&
        existsSync(path.join(scanDir, f)) &&
        statSync(path.join(scanDir, f)).isFile(),
    );
}

/** Redact a token for reporting: first char + length. Never print the token. */
function redact(token) {
  return `${token[0]}${"*".repeat(Math.max(token.length - 1, 2))} (len ${token.length})`;
}

let leaks = 0;
for (const file of listFiles()) {
  const text = readFileSync(path.join(scanDir, file), "utf8");
  const candidates = new Set([...extractTokens(text), ...extractBigrams(text)]);
  for (const token of candidates) {
    if (blocked.has(hashToken(token))) {
      leaks += 1;
      console.error(`LEAK  ${file}: token ${redact(token)} matches the privacy blocklist`);
    }
  }
}

if (leaks > 0) {
  console.error(
    `\nprivacy-guard: ${leaks} blocked token(s) found in committed files. ` +
      "Remove the real name/email/company — demo content must be fictional.",
  );
  process.exit(1);
}
console.log("privacy-guard: clean — no blocked tokens in committed files.");
