import { describe, expect, it } from "vitest";
import { runFollowupCadence } from "@/lib/scripts";
import { followUpCadenceSchema } from "@/lib/domain";
import { dataRepoPath } from "./helpers/temp-repo";

/**
 * Zod-boundary test for followup-cadence.mjs (the established pattern): run the
 * REAL script against the real repo when CAREER_OPS_PATH is set, otherwise skip
 * so CI without the private repo stays green.
 */
const repo = dataRepoPath();

describe.skipIf(!repo)("runFollowupCadence — zod boundary (real script)", () => {
  it("validates the real script output against the schema", async () => {
    const cadence = await runFollowupCadence(repo as string);
    // Re-validating is cheap and proves the wrapper returns schema-valid data.
    expect(() => followUpCadenceSchema.parse(cadence)).not.toThrow();
    expect(cadence.metadata.totalTracked).toBeGreaterThanOrEqual(0);
    expect(cadence.cadenceConfig.applied_first).toBeGreaterThan(0);
    for (const e of cadence.entries) {
      expect(["urgent", "overdue", "waiting", "cold"]).toContain(e.urgency);
      if (e.nextFollowupDate !== null) {
        expect(e.nextFollowupDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});
