import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addManualOffer,
  insertPendingLine,
  pipelinePathFor,
  PipelineWriteError,
  slugFromUrl,
} from "@/lib/writers";
import { parsePipeline } from "@/lib/parsers/pipeline";

/**
 * Pipeline writer tests — plain OS temp dirs (the writer only touches
 * data/pipeline.md + jds/, so no data-repo copy is needed and the suite ALWAYS
 * runs). Covers: JD file creation, the `[!]` line insertion + round-trip, jds
 * numbering, default-skeleton creation, and input rejection.
 */

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "career-ops-pipeline-test-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const SEED = `# Pipeline — Pending URLs

## Pending
- [ ] https://jobs.example.com/scanned | Scanned Co | Role

## Processed
- [x] #001 | https://jobs.example.com/done | Done Co | Role | 3.0/5 | PDF ❌
`;

async function seedPipeline(content = SEED): Promise<void> {
  await fs.mkdir(path.join(root, "data"), { recursive: true });
  await fs.writeFile(pipelinePathFor(root), content, "utf8");
}

describe("pipeline writer — addManualOffer", () => {
  it("saves the JD to jds/ and inserts a [!] line, returning the manual item", async () => {
    await seedPipeline();
    const item = await addManualOffer(root, {
      url: "https://www.welcometothejungle.com/fr/companies/acme/jobs/frontend-engineer",
      jd: "We are hiring a Frontend Engineer. React, TypeScript, Tailwind.",
    });

    expect(item.kind).toBe("manual");
    expect(item.section).toBe("pending");
    expect(item.url).toBe(
      "https://www.welcometothejungle.com/fr/companies/acme/jobs/frontend-engineer",
    );
    expect(item.localJd).toBe("jds/001-welcometothejungle-frontend-engineer.md");

    // JD file exists with the pasted text + provenance header.
    const jd = await fs.readFile(path.join(root, item.localJd!), "utf8");
    expect(jd).toContain("We are hiring a Frontend Engineer");
    expect(jd).toContain("<!-- Source: https://www.welcometothejungle.com");

    // The line is in the Pending section and round-trips through the parser.
    const written = await fs.readFile(pipelinePathFor(root), "utf8");
    expect(written).toContain("- [!] https://www.welcometothejungle.com");
    const pending = parsePipeline(written).filter((i) => i.section === "pending");
    expect(pending.some((i) => i.kind === "manual" && i.localJd === item.localJd)).toBe(
      true,
    );
    // The pre-existing scanned pending row is preserved.
    expect(pending.some((i) => i.company === "Scanned Co")).toBe(true);
  });

  it("numbers jds/ files by max existing + 1", async () => {
    await seedPipeline();
    await fs.mkdir(path.join(root, "jds"), { recursive: true });
    await fs.writeFile(path.join(root, "jds", "004-existing.md"), "old", "utf8");

    const item = await addManualOffer(root, {
      url: "https://linkedin.com/jobs/view/42",
      jd: "Role description text.",
    });
    expect(item.localJd).toBe("jds/005-linkedin-42.md");
  });

  it("creates a default pipeline.md when the file is absent", async () => {
    const item = await addManualOffer(root, {
      url: "https://linkedin.com/jobs/view/9",
      jd: "Some JD.",
    });
    const written = await fs.readFile(pipelinePathFor(root), "utf8");
    expect(written).toContain("## Pending");
    expect(written).toContain("## Processed");
    expect(written).toContain(item.url!);
  });

  it("rejects an invalid URL and an empty JD", async () => {
    await seedPipeline();
    await expect(
      addManualOffer(root, { url: "not-a-url", jd: "x" }),
    ).rejects.toBeInstanceOf(PipelineWriteError);
    await expect(
      addManualOffer(root, { url: "https://example.com/x", jd: "   " }),
    ).rejects.toBeInstanceOf(PipelineWriteError);
  });

  it("two adds get distinct numbers and both land in Pending", async () => {
    await seedPipeline();
    const a = await addManualOffer(root, {
      url: "https://linkedin.com/jobs/view/1",
      jd: "A",
    });
    const b = await addManualOffer(root, {
      url: "https://linkedin.com/jobs/view/2",
      jd: "B",
    });
    expect(a.localJd).not.toBe(b.localJd);
    const pending = parsePipeline(await fs.readFile(pipelinePathFor(root), "utf8")).filter(
      (i) => i.kind === "manual",
    );
    expect(pending).toHaveLength(2);
  });
});

describe("pipeline writer — helpers", () => {
  it("slugFromUrl derives {host-brand}-{last-path-seg}", () => {
    expect(slugFromUrl("https://www.welcometothejungle.com/fr/jobs/frontend-eng")).toBe(
      "welcometothejungle-frontend-eng",
    );
    expect(slugFromUrl("https://linkedin.com/jobs/view/123")).toBe("linkedin-123");
    expect(slugFromUrl("not a url")).toBe("offer");
  });

  it("insertPendingLine inserts at the top of Pending (creates it if absent)", () => {
    const withSection = insertPendingLine("## Pending\n- [ ] existing\n", "- [!] new");
    const lines = withSection.split("\n");
    expect(lines[0]).toBe("## Pending");
    expect(lines[1]).toBe("- [!] new");

    const noSection = insertPendingLine("# Title\n", "- [!] new");
    expect(noSection).toContain("## Pending");
    expect(noSection).toContain("- [!] new");
  });
});
