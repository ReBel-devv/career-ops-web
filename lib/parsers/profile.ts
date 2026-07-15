import { load as loadYaml } from "js-yaml";
import { profileSchema, type Profile } from "@/lib/domain";

/**
 * Parse `config/profile.yml` into the camelCase {@link Profile} domain. The
 * YAML is user-authored and snake_case; every section is optional, so missing
 * keys become nulls / empty arrays rather than parse failures. Unknown keys are
 * ignored (the file may carry more than the dashboard surfaces).
 */

/** Coerce any YAML scalar to a trimmed string, or null when empty/absent. */
function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" ? null : t;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(str).filter((s): s is string => s !== null);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseProfile(content: string): Profile {
  const doc = asRecord(loadYaml(content));

  const candidate = asRecord(doc.candidate);
  const targetRoles = asRecord(doc.target_roles);
  const narrative = asRecord(doc.narrative);
  const compensation = asRecord(doc.compensation);
  const location = asRecord(doc.location);
  const coverLetter = asRecord(doc.cover_letter);

  const archetypes = Array.isArray(targetRoles.archetypes)
    ? targetRoles.archetypes.map((raw) => {
        const a = asRecord(raw);
        return {
          name: str(a.name) ?? "",
          level: str(a.level),
          fit: str(a.fit),
          note: str(a.note),
        };
      })
    : [];

  const proofPoints = Array.isArray(narrative.proof_points)
    ? narrative.proof_points.map((raw) => {
        const p = asRecord(raw);
        return {
          name: str(p.name) ?? "",
          url: str(p.url),
          heroMetric: str(p.hero_metric),
        };
      })
    : [];

  return profileSchema.parse({
    candidate: {
      fullName: str(candidate.full_name),
      email: str(candidate.email),
      phone: str(candidate.phone),
      location: str(candidate.location),
      linkedin: str(candidate.linkedin),
      portfolioUrl: str(candidate.portfolio_url),
      github: str(candidate.github),
      photo: str(candidate.photo),
    },
    targetRoles: {
      primary: strArray(targetRoles.primary),
      archetypes: archetypes.filter((a) => a.name !== ""),
    },
    narrative: {
      headline: str(narrative.headline),
      exitStory: str(narrative.exit_story),
      superpowers: strArray(narrative.superpowers),
      proofPoints: proofPoints.filter((p) => p.name !== ""),
    },
    compensation: {
      targetRange: str(compensation.target_range),
      currency: str(compensation.currency),
      minimum: str(compensation.minimum),
      locationFlexibility: str(compensation.location_flexibility),
    },
    location: {
      country: str(location.country),
      city: str(location.city),
      timezone: str(location.timezone),
      visaStatus: str(location.visa_status),
    },
    coverLetter: {
      primaryDomain: str(coverLetter.primary_domain),
      noticePeriodDays: num(coverLetter.notice_period_days),
    },
  });
}
