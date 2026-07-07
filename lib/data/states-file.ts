import { promises as fs } from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { statesFileSchema, type CanonicalState } from "@/lib/domain";

/**
 * Parse the data repo's `templates/states.yml` — the shared contract between
 * career-ops (writer) and dashboard (reader/writer). Read at request time,
 * never cached, never hardcoded in FS mode.
 */
export async function readStatesFile(
  repoPath: string,
): Promise<CanonicalState[]> {
  const raw = await fs.readFile(
    path.join(repoPath, "templates", "states.yml"),
    "utf8",
  );
  const doc: unknown = loadYaml(raw);
  return statesFileSchema.parse(doc).states;
}
