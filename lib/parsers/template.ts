import { load as loadYaml } from "js-yaml";
import {
  templateSourceSchema,
  type TemplateSource,
} from "@/lib/domain";

/**
 * Template file format — YAML frontmatter + markdown body:
 *
 *   ---
 *   title: Contacter un recruteur IT (LinkedIn)
 *   type: linkedin
 *   saved_at: 2026-07-16T21:00:00.000Z
 *   source: generated
 *   note: created from prompt "…"
 *   ---
 *
 *   Bonjour {…}
 *
 * Parsing degrades gracefully (F2 spirit): a file with no/broken frontmatter
 * still parses — title falls back to the first `# heading` or the slug, and
 * the whole content becomes the body. Never throws.
 */

export interface TemplateFileMeta {
  title: string | null;
  type: string | null;
  savedAt: string | null;
  source: TemplateSource;
  note: string | null;
}

export interface ParsedTemplateFile {
  meta: TemplateFileMeta;
  body: string;
}

const FALLBACK_META: TemplateFileMeta = {
  title: null,
  type: null,
  savedAt: null,
  source: "manual",
  note: null,
};

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  // js-yaml parses unquoted ISO datetimes as Date objects.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

/** First `# heading` of the body, as a title fallback for handwritten files. */
function titleFromBody(body: string): string | null {
  const m = /^#\s+(.+)$/m.exec(body);
  return m ? m[1].trim() : null;
}

/** Parse a template (current or history) file. Never throws. */
export function parseTemplateFile(content: string): ParsedTemplateFile {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!m) {
    const body = content.trim();
    return { meta: { ...FALLBACK_META, title: titleFromBody(body) }, body };
  }

  let raw: unknown = null;
  try {
    raw = loadYaml(m[1]);
  } catch {
    // Broken YAML → treat as frontmatter-less.
  }
  const body = content.slice(m[0].length).replace(/^\r?\n/, "").trimEnd();
  if (typeof raw !== "object" || raw === null) {
    return { meta: { ...FALLBACK_META, title: titleFromBody(body) }, body };
  }

  const record = raw as Record<string, unknown>;
  const sourceParse = templateSourceSchema.safeParse(record.source);
  return {
    meta: {
      title: asString(record.title) ?? titleFromBody(body),
      type: asString(record.type)?.toLowerCase() ?? null,
      savedAt: asString(record.saved_at) ?? asString(record.savedAt),
      source: sourceParse.success ? sourceParse.data : "manual",
      note: asString(record.note),
    },
    body,
  };
}

/** YAML-quote a scalar defensively (titles/notes are free text). */
function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

/** Serialize a template file — the exact inverse of `parseTemplateFile`. */
export function serializeTemplateFile(input: {
  title: string;
  type: string | null;
  savedAt: string;
  source: TemplateSource;
  note: string | null;
  body: string;
}): string {
  const lines = [
    "---",
    `title: ${yamlQuote(input.title)}`,
    ...(input.type ? [`type: ${yamlQuote(input.type)}`] : []),
    `saved_at: ${yamlQuote(input.savedAt)}`,
    `source: ${input.source}`,
    ...(input.note ? [`note: ${yamlQuote(input.note)}`] : []),
    "---",
    "",
    input.body.trimEnd(),
    "",
  ];
  return lines.join("\n");
}
