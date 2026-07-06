import { z } from "zod";

/**
 * Canonical application states — parsed at request time from the data repo's
 * `templates/states.yml` ("Source of truth for career-ops (writer) and
 * dashboard (reader)"). Never hardcode the list in FS mode.
 */

/** Shape of one entry in states.yml (raw YAML keys). */
const rawStateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  description: z.string().default(""),
  dashboard_group: z.string().min(1),
});

export const canonicalStateSchema = rawStateSchema.transform((s) => ({
  id: s.id,
  label: s.label,
  aliases: s.aliases,
  description: s.description,
  dashboardGroup: s.dashboard_group,
}));

export type CanonicalState = z.output<typeof canonicalStateSchema>;

export const statesFileSchema = z.object({
  states: z.array(canonicalStateSchema).min(1),
});

/**
 * Case-insensitive resolver from a raw tracker Status cell to its canonical
 * state. Matches label, id, and every alias. Markdown bold is stripped so a
 * legacy `**Applied**` cell still resolves (rendering, not writing, concern).
 */
export function buildStatusResolver(
  states: readonly CanonicalState[],
): (raw: string) => CanonicalState | null {
  const index = new Map<string, CanonicalState>();
  for (const state of states) {
    index.set(state.id.toLowerCase(), state);
    index.set(state.label.toLowerCase(), state);
    for (const alias of state.aliases) index.set(alias.toLowerCase(), state);
  }
  return (raw) => {
    const key = raw.replace(/\*\*/g, "").trim().toLowerCase();
    return index.get(key) ?? null;
  };
}
