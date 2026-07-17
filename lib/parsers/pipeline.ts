import {
  pipelineItemSchema,
  type PipelineItem,
  type PipelineItemKind,
} from "@/lib/domain";

/**
 * `data/pipeline.md` parser — the Discovery inbox (plan §4.4, READ-ONLY).
 *
 * Real file shape:
 *
 * ```
 * ## Pending
 * <!-- free-form comment lines are ignored -->
 * - [ ] https://…/jobs/x | Company | Role | Location | ⭐ note
 *
 * ## Processed
 * - [x] #028 | https://… | Company | Role | 3.2/5 | PDF ❌
 * - [screened] Batch scan 2026-07-06 : ~42 offers screened out (…)
 * - [dup] https://… | Company | Role | duplicate of #022
 * - [skip] Company (Region) | Role | SKIP — reason      ← no URL
 * ```
 *
 * The parser never loses information: every recognized line keeps its full
 * original text in `raw`, and unrecognized lines (headings, comments, prose)
 * are simply skipped. Pure — no fs, no React.
 */

const HEADING_RE = /^##\s+(.*)$/;
const ITEM_RE = /^-\s*\[(\s*|x|dup|skip|screened|!)\]\s*(.*)$/i;
const URL_RE = /^https?:\/\/\S+$/i;
const REPORT_NUM_RE = /^#(\d+)$/;
const SCORE_RE = /^\d+(?:\.\d+)?\/5$/;
const PDF_RE = /^PDF\b/i;
/** `local:jds/…` cell — a JD stored in the repo (manual `[!]` offers). */
const LOCAL_RE = /^local:(\S+)/i;
/** Labeled segments `posted:`/`note:` — positional-agnostic, never company/role. */
const LABEL_RE = /^(?:posted|note):/i;

function kindOf(marker: string): PipelineItemKind {
  const m = marker.trim().toLowerCase();
  if (m === "") return "pending";
  if (m === "x") return "done";
  if (m === "dup") return "dup";
  if (m === "skip") return "skip";
  if (m === "!") return "manual";
  return "screened";
}

export function parsePipeline(content: string): PipelineItem[] {
  const items: PipelineItem[] = [];
  let section: "pending" | "processed" | null = null;

  for (const line of content.split(/\r?\n/)) {
    const heading = HEADING_RE.exec(line.trim());
    if (heading) {
      const title = heading[1].trim().toLowerCase();
      section = title.startsWith("pending")
        ? "pending"
        : title.startsWith("processed")
          ? "processed"
          : null;
      continue;
    }

    const item = ITEM_RE.exec(line.trim());
    if (!item) continue; // blank, prose, or <!-- comment --> line

    const kind = kindOf(item[1]);
    const body = item[2].trim();

    let url: string | null = null;
    let reportNum: number | null = null;
    let scoreRaw: string | null = null;
    let company: string | null = null;
    let role: string | null = null;
    let localJd: string | null = null;

    // A screened line is a free-prose batch summary — no per-offer structure.
    if (kind !== "screened") {
      const rest: string[] = [];
      for (const cell of body.split("|").map((c) => c.trim())) {
        if (cell === "") continue;
        const num = REPORT_NUM_RE.exec(cell);
        const local = LOCAL_RE.exec(cell);
        if (num && reportNum === null) {
          reportNum = Number.parseInt(num[1], 10);
        } else if (url === null && URL_RE.test(cell)) {
          url = cell;
        } else if (scoreRaw === null && SCORE_RE.test(cell)) {
          scoreRaw = cell;
        } else if (local && localJd === null) {
          localJd = local[1]; // the path after `local:` (e.g. jds/…-slug.md)
        } else if (!PDF_RE.test(cell) && !LABEL_RE.test(cell)) {
          // Skip `local:`, `posted:`/`note:`, PDF and #num/url/score cells so
          // `company | role` land correctly even when they are absent (a manual
          // `[!] url | local:jds/…` line has no company/role → both stay null).
          rest.push(cell);
        }
      }
      company = rest[0] ?? null;
      role = rest[1] ?? null;
    }

    items.push(
      pipelineItemSchema.parse({
        // Items before any recognized heading fall back to the kind's home.
        section: section ?? (kind === "pending" || kind === "manual" ? "pending" : "processed"),
        kind,
        url,
        company,
        role,
        reportNum,
        scoreRaw,
        localJd,
        raw: line,
      }),
    );
  }

  return items;
}
