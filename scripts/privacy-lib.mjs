import crypto from "node:crypto";

/**
 * Shared logic for the privacy guard (scripts/privacy-guard.mjs) and the
 * blocklist generator (scripts/generate-privacy-blocklist.mjs).
 *
 * Design (plan §7 privacy gates): the repo must never commit the user's
 * identity or any company from the private tracker — but a plaintext denylist
 * would itself BE the leak. So the generator (run locally, where the private
 * repo exists) emits only sha256 hashes of lowercased distinctive tokens, and
 * the guard hashes every candidate token found in committed files and compares
 * digests. CI never needs the private repo.
 *
 * Known tradeoff, accepted deliberately: sha256 of a short dictionary word is
 * brute-forceable, so the hashes give heuristic secrecy, not cryptographic
 * secrecy — acceptable because the protected tokens are low-sensitivity on
 * their own (a first name fragment, a public company name); the harm model is
 * "the repo visibly links them to a private job search", which the hashes
 * avoid while still catching accidental leaks verbatim.
 */

/** sha256 hex of a normalized token. */
export function hashToken(token) {
  return crypto.createHash("sha256").update(normalizeToken(token)).digest("hex");
}

/** Lowercase + strip accents so `Zoë` and `zoe` hash identically. */
export function normalizeToken(token) {
  return token
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Tokens that are structurally unavoidable in ANY web codebase (deploy
 * platform names, CSS keywords, programming languages, common tech nouns…).
 * The generator refuses to hash them — otherwise the guard would flag every
 * `vercel.json` or `cursor-grab` class. Entries here are generic web-dev
 * vocabulary; the list does not assert anything about any private dataset.
 */
export const GENERIC_STOPLIST = new Set([
  "vercel",
  "anthropic", // AI vendor: @anthropic-ai/claude-agent-sdk, ANTHROPIC_API_KEY
  "claude", // AI vendor product: claude-agent-sdk, model ids
  "cursor",
  "ruby",
  "react",
  "next",
  "node",
  "design",
  "engineer",
  "frontend",
  "fullstack",
  "labs",
  "studio",
  "ai",
  "web",
  "app",
  "grid",
  "dust", // also generic English
  "ramp", // also generic English
  "pigment", // also generic English
  "alan", // bare first name, too generic to flag
]);

/**
 * Candidate tokens of a text: lowercase words (incl. accented→stripped),
 * plus dotted/dashed compounds (emails, handles, slugs, domains) so
 * `some.user@mail`, `some-slug`, `user-handle` are each caught whole
 * AND word-by-word.
 */
export function extractTokens(text) {
  const norm = normalizeToken(text);
  const tokens = new Set();
  // simple words, ≥3 chars (shorter tokens are pure noise)
  for (const m of norm.matchAll(/[a-z0-9]{3,}/g)) tokens.add(m[0]);
  // compounds: emails, domains, slugs, handles
  for (const m of norm.matchAll(/[a-z0-9][a-z0-9._@+-]{2,}[a-z0-9]/g)) {
    tokens.add(m[0]);
  }
  return tokens;
}

/**
 * Multi-word phrases can't be caught by single-token hashing; the blocklist
 * also carries hashes of normalized bigrams ("acme labs" → one hash). This
 * extracts every adjacent word pair of a text.
 */
export function extractBigrams(text) {
  const words = [...normalizeToken(text).matchAll(/[a-z0-9]{2,}/g)].map((m) => m[0]);
  const bigrams = new Set();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}
