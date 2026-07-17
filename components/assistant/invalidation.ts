/**
 * Map a repo file the assistant just wrote to the TanStack Query keys that read
 * it, so the dashboard refreshes automatically after an approved edit
 * (ASSISTANT-PLAN §7 Phase 4). Matching is by path suffix, since a tool's
 * `file_path` may be absolute (cwd-based) or repo-relative.
 */
import {
  applicationsKey,
  followUpCadenceKey,
  followUpsKey,
  outreachKey,
  profileKey,
  statesKey,
  templateKey,
  templatesKey,
} from "@/lib/client/queries";

type Key = readonly unknown[];

/** Query keys to invalidate after a write to `filePath` (empty if none map). */
export function invalidationKeysForPath(filePath: string): Key[] {
  const p = filePath.replace(/\\/g, "/");
  const ends = (suffix: string) => p.endsWith(suffix);

  // Profile aggregate: profile.yml + the profile texts.
  if (ends("config/profile.yml") || ends("_profile.md") || ends("/cv.md") || p === "cv.md") {
    return [profileKey];
  }
  if (ends("data/applications.md")) {
    return [applicationsKey, ["report-facets"]];
  }
  if (ends("data/pipeline.md")) {
    return [["pipeline"]];
  }
  if (ends("data/outreach.yml")) {
    return [outreachKey];
  }
  if (ends("data/follow-ups.md")) {
    // The board's overdue glyph is derived from cadence → refresh applications too.
    return [followUpsKey, followUpCadenceKey, applicationsKey];
  }
  if (ends("templates/states.yml")) {
    return [statesKey, applicationsKey];
  }
  // Message templates: refresh the list, plus the detail view of the touched
  // slug (current file or one of its history entries).
  {
    const m = /(?:^|\/)templates\/messages\/(?:history\/)?([a-z0-9][a-z0-9-]*)(?:\.md|\/)/.exec(p);
    if (m) return [templatesKey, templateKey(m[1])];
  }
  if (p.includes("/reports/") || p.startsWith("reports/")) {
    return [["report-facets"]];
  }
  return [];
}
