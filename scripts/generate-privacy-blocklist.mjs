#!/usr/bin/env node
/**
 * Regenerate scripts/privacy-blocklist.json from the PRIVATE data repo.
 *
 *   CAREER_OPS_PATH=/path/to/career-ops node scripts/generate-privacy-blocklist.mjs
 *
 * Run LOCALLY whenever the tracker gains new companies (CI can't — it has no
 * access to the private repo, by design). Reads, never writes, the data repo.
 *
 * What gets hashed (sha256 of normalized tokens — see privacy-lib.mjs for the
 * threat model):
 * - every company name from data/applications.md — the whole (multi-word)
 *   name plus each distinctive word ≥5 chars,
 * - report filename slugs (whole slug only — their words are generic role
 *   vocabulary),
 * - the candidate identity from config/profile.yml: name fragments, email +
 *   its local part, github/linkedin handles, portfolio host.
 *
 * Tokens in the GENERIC_STOPLIST (and generic web domains) are never hashed —
 * they'd flag ordinary web code (`vercel.json`, `cursor-grab`, a score
 * "ramp"…). Accepted, documented gap: a private-tracker company whose name IS
 * a generic English/tech word cannot be guarded as a single word without
 * drowning the guard in false positives; its multi-word forms and slugs are
 * still caught.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractTokens,
  GENERIC_STOPLIST,
  hashToken,
  normalizeToken,
} from "./privacy-lib.mjs";

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(WEB_ROOT, "scripts", "privacy-blocklist.json");

/** Generic web hosts/handles that must never be hashed. */
const DOMAIN_STOPLIST = new Set([
  "github",
  "github.com",
  "linkedin",
  "linkedin.com",
  "www",
  "https",
  "http",
]);

const repo = process.env.CAREER_OPS_PATH?.trim();
if (!repo || !existsSync(repo)) {
  console.error("CAREER_OPS_PATH must point at the private data repo.");
  process.exit(1);
}

/** Raw sensitive strings (never persisted — only their hashes are). */
const sensitive = new Set();

function isStoplisted(norm) {
  return GENERIC_STOPLIST.has(norm) || DOMAIN_STOPLIST.has(norm);
}

/** Add a whole phrase/handle (normalized, single-spaced), unless generic. */
function addWhole(phrase, minLen = 4) {
  const whole = normalizeToken(phrase).replace(/\s+/g, " ").trim();
  if (whole.length >= minLen && !isStoplisted(whole)) sensitive.add(whole);
}

/** Add each distinctive word of a phrase (stoplist-filtered). */
function addWords(phrase, minLen) {
  for (const token of extractTokens(normalizeToken(phrase))) {
    if (token.length >= minLen && !isStoplisted(token)) sensitive.add(token);
  }
}

// --- tracker companies -------------------------------------------------------
const tracker = readFileSync(path.join(repo, "data", "applications.md"), "utf8");
for (const line of tracker.split(/\r?\n/)) {
  if (!line.trim().startsWith("|")) continue;
  const cells = line.split("|").map((c) => c.trim());
  if (!/^\d+$/.test(cells[1] ?? "")) continue;
  const company = cells[3];
  if (!company) continue;
  addWhole(company);
  addWords(company, 5);
}

// --- report slugs (whole slug only — slug words are generic role vocab) ------
const reportsDir = path.join(repo, "reports");
if (existsSync(reportsDir)) {
  for (const file of readdirSync(reportsDir)) {
    const m = /^\d+-(.+)-\d{4}-\d{2}-\d{2}\.md$/.exec(file);
    if (!m) continue;
    addWhole(m[1]); // dashed form (matches file paths / slugs)
    addWhole(m[1].replace(/-/g, " ")); // space form (matches prose bigrams+)
  }
}

// --- candidate identity from config/profile.yml ------------------------------
const profilePath = path.join(repo, "config", "profile.yml");
if (existsSync(profilePath)) {
  const profile = readFileSync(profilePath, "utf8");
  const grab = (re) => [...profile.matchAll(re)].map((m) => m[1]);
  for (const name of grab(/full_name:\s*"?([^"\n]+)"?/g)) {
    addWhole(name, 3);
    for (const part of name.split(/\s+/)) addWhole(part, 3); // identity: short ok
  }
  for (const email of grab(/email:\s*"?([^"\n]+)"?/g)) {
    addWhole(email, 3);
    addWhole(email.split("@")[0], 3);
  }
  for (const url of grab(/(?:linkedin|portfolio_url|github):\s*"?([^"\n]+)"?/g)) {
    for (const piece of url.replace(/^https?:\/\//, "").split("/")) {
      addWhole(piece, 4); // hosts + handles; DOMAIN_STOPLIST filters generics
    }
  }
}

const hashes = [...sensitive].map(hashToken).sort();
writeFileSync(
  OUT,
  JSON.stringify(
    {
      _comment:
        "sha256 hashes of normalized sensitive tokens (identity + private tracker companies). Regenerate with scripts/generate-privacy-blocklist.mjs — never commit plaintext. See scripts/privacy-lib.mjs for the threat model.",
      generatedAt: new Date().toISOString().slice(0, 10),
      hashes,
    },
    null,
    2,
  ) + "\n",
);
console.log(`privacy-blocklist.json written: ${hashes.length} hashes.`);
