import { load as loadYaml } from "js-yaml";
import {
  machineSummarySchema,
  reportSchema,
  scoreGlobalSchema,
  type LocationBucket,
  type MachineSummary,
  type Report,
  type ReportBlock,
  type ReportFacet,
  type ReportHeader,
  type ScoreGlobal,
  type ScoreRow,
} from "@/lib/domain";

/**
 * Pure parser for a career-ops evaluation report (`reports/NNN-slug-DATE.md`).
 *
 * Reports are hand-and-LLM-authored French prose with a consistent *shape* but
 * loose surface details (accents, spacing, key names, block titles, field
 * order all drift between reports — see the fixtures). Everything here degrades
 * gracefully: missing Machine Summary → `null`, missing Score Global → `null`,
 * no lettered blocks → sections still returned with `letter: null`, and the
 * full raw markdown is always preserved for a render fallback (F2 AC).
 *
 * This file is pure (node + js-yaml only, no React) so it is unit-testable
 * against fixtures.
 */

/** Strip diacritics + lowercase so `Archétype` / `Arquetipo` / `Archetype`,
 * `Légitimité` / `Legitimacy`, etc. all normalize to the same key. */
function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Map a normalized header label to a canonical `ReportHeader` field. */
const HEADER_KEY_MAP: Record<string, keyof ReportHeader> = {
  date: "date",
  archetype: "archetype",
  arquetipo: "archetype",
  score: "score",
  legitimacy: "legitimacy",
  legitimite: "legitimacy",
  verification: "verification",
  url: "url",
  pdf: "pdf",
  "batch id": "batchId",
};

/** `**Key:** value` (colon inside the bold, tolerant of `**Date :**`). */
const HEADER_LINE = /^\*\*\s*(.+?)\s*:\s*\*\*\s*(.*)$/;
const H2 = /^##\s+(.*)$/;

/** First `## ` heading index, or the line count when there is none. */
function firstSectionIndex(lines: string[]): number {
  const i = lines.findIndex((l) => H2.test(l));
  return i === -1 ? lines.length : i;
}

function parseHeader(lines: string[]): { title: string; header: ReportHeader } {
  const titleLine = lines.find((l) => /^#\s+/.test(l));
  const title = titleLine ? titleLine.replace(/^#\s+/, "").trim() : "";

  const header: ReportHeader = { extras: {} };
  const end = firstSectionIndex(lines);
  for (let i = 0; i < end; i++) {
    const m = HEADER_LINE.exec(lines[i]);
    if (!m) continue;
    const key = normalizeKey(m[1]);
    const value = m[2].trim();
    if (value === "") continue;
    const field = HEADER_KEY_MAP[key];
    if (field === "extras") continue;
    if (field) {
      // All mapped header fields are string-valued.
      (header as Record<string, unknown>)[field] = value;
    } else {
      header.extras[key] = value;
    }
  }
  return { title, header };
}

/** Extract the fenced YAML under `## Machine Summary` and parse it (loose). */
function parseMachineSummary(lines: string[]): MachineSummary | null {
  const headingIdx = lines.findIndex((l) => {
    const m = H2.exec(l);
    return m ? normalizeKey(m[1]).startsWith("machine summary") : false;
  });
  if (headingIdx === -1) return null;

  // Find the fenced block after the heading, before the next `## `.
  let open = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (H2.test(lines[i])) break;
    if (/^```/.test(lines[i].trim())) {
      open = i;
      break;
    }
  }
  if (open === -1) return null;
  let close = -1;
  for (let i = open + 1; i < lines.length; i++) {
    if (/^```/.test(lines[i].trim())) {
      close = i;
      break;
    }
  }
  if (close === -1) return null;

  const yaml = lines.slice(open + 1, close).join("\n");
  try {
    const doc = loadYaml(yaml);
    if (doc === null || typeof doc !== "object") return null;
    return machineSummarySchema.parse(doc);
  } catch {
    return null;
  }
}

/** Split a `| a | b | c |` row into trimmed cells (drops leading/trailing empties). */
function tableCells(line: string): string[] {
  const cells = line.split("|").map((c) => c.trim());
  if (cells.length && cells[0] === "") cells.shift();
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

const SEPARATOR_ROW = /^\|?[\s:|-]+\|?$/;

/** Parse the `## Score Global` markdown table. */
function parseScoreGlobal(lines: string[]): ScoreGlobal | null {
  const headingIdx = lines.findIndex((l) => {
    const m = H2.exec(l);
    return m ? normalizeKey(m[1]) === "score global" : false;
  });
  if (headingIdx === -1) return null;

  const rows: ScoreRow[] = [];
  let global: ScoreRow | null = null;
  let seenHeader = false;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (H2.test(line)) break;
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (SEPARATOR_ROW.test(trimmed)) continue;
    const cells = tableCells(trimmed);
    if (cells.length < 2) continue;
    if (!seenHeader) {
      // First data-looking row is the header (`Dimension | Score | Commentaire`).
      seenHeader = true;
      continue;
    }
    const row: ScoreRow = {
      dimension: cells[0].replace(/\*\*/g, "").trim(),
      score: (cells[1] ?? "").replace(/\*\*/g, "").trim(),
      comment: (cells[2] ?? "").trim(),
    };
    if (/global/i.test(row.dimension)) global = row;
    else rows.push(row);
  }
  if (rows.length === 0 && global === null) return null;
  return scoreGlobalSchema.parse({ rows, global });
}

/** Leading block letter(s): `A)` → `A`, `E-F)` → `E-F`, `C-D)` → `C-D`. */
function detectLetter(title: string): string | null {
  const m = /^([A-G])(?:\s*-\s*([A-G]))?\s*\)/.exec(title.trim());
  if (!m) return null;
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}

/** Split the body into `## ` sections, excluding Machine Summary + Score Global. */
function parseBlocks(lines: string[]): ReportBlock[] {
  const headingIdxs: number[] = [];
  lines.forEach((l, i) => {
    if (H2.test(l)) headingIdxs.push(i);
  });

  const blocks: ReportBlock[] = [];
  for (let h = 0; h < headingIdxs.length; h++) {
    const start = headingIdxs[h];
    const end = h + 1 < headingIdxs.length ? headingIdxs[h + 1] : lines.length;
    const title = (H2.exec(lines[start])?.[1] ?? "").trim();
    const norm = normalizeKey(title);
    if (norm.startsWith("machine summary") || norm === "score global") continue;
    const markdown = lines.slice(start, end).join("\n").replace(/\s+$/, "");
    blocks.push({ letter: detectLetter(title), title, markdown });
  }
  return blocks;
}

/** ATS vendor from the posting URL host (Lever / Greenhouse / Ashby / …). */
export function atsVendorFromUrl(url?: string): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  const known: [RegExp, string][] = [
    [/(^|\.)lever\.co$/, "Lever"],
    [/greenhouse\.io$/, "Greenhouse"],
    [/ashbyhq\.com$/, "Ashby"],
    [/myworkdayjobs\.com$/, "Workday"],
    [/smartrecruiters\.com$/, "SmartRecruiters"],
    [/workable\.com$/, "Workable"],
    [/recruitee\.com$/, "Recruitee"],
    [/teamtailor\.com$/, "Teamtailor"],
    [/personio\.(com|de)$/, "Personio"],
    [/jobvite\.com$/, "Jobvite"],
    [/icims\.com$/, "iCIMS"],
    [/breezy\.hr$/, "Breezy"],
    [/bamboohr\.com$/, "BambooHR"],
  ];
  for (const [re, name] of known) if (re.test(host)) return name;
  const label = host
    .replace(/^(jobs|job-boards|boards|careers|apply|www)\./, "")
    .split(".")[0];
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : null;
}

/** Coarse EU / US / Remote / Other bucket from free-text location. */
export function bucketLocation(text?: string): LocationBucket | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/remote|t[ée]l[ée]travail/.test(t)) return "Remote";
  if (
    /\b(us|usa|u\.s\.|united states|san francisco|\bsf\b|nyc|new york|california|seattle|austin|boston|remote us)\b/.test(
      t,
    )
  )
    return "US";
  if (
    /\b(eu|europe|paris|london|londres|lisbon|lisbonne|amsterdam|berlin|munich|madrid|barcelona|dublin|france|germany|spain|netherlands|belgium|portugal|ireland|zurich|z[üu]rich|geneva|gen[èe]ve|milan|warsaw)\b/.test(
      t,
    )
  )
    return "EU";
  return "Other";
}

export interface ParseReportInput {
  content: string;
  /** Path relative to the data repo root, e.g. `reports/001-mistral-ai-2026-07-04.md`. */
  path: string;
  num: number;
}

/** Parse a report file's content into the structured `Report`. Never throws. */
export function parseReport({ content, path, num }: ParseReportInput): Report {
  const lines = content.split(/\r?\n/);
  const { title, header } = parseHeader(lines);
  const machineSummary = parseMachineSummary(lines);
  const scoreGlobal = parseScoreGlobal(lines);
  const blocks = parseBlocks(lines);
  const locationText = machineSummary?.location ?? header.extras.location;

  return reportSchema.parse({
    num,
    path,
    title,
    header,
    machineSummary,
    scoreGlobal,
    blocks,
    markdown: content,
    atsVendor: atsVendorFromUrl(header.url),
    locationBucket: bucketLocation(locationText),
  });
}

/** Derive the lightweight filter facet from a parsed report. */
export function reportFacet(report: Report): ReportFacet {
  return {
    num: report.num,
    archetype: report.machineSummary?.archetype ?? report.header.archetype ?? null,
    atsVendor: report.atsVendor,
    locationBucket: report.locationBucket,
  };
}
