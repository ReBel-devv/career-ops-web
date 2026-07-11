import { describe, expect, it } from "vitest";
import { parsePipeline } from "@/lib/parsers/pipeline";

/**
 * Unit tests for the data/pipeline.md parser (Discovery, M5). Synthetic
 * fixture mirroring every line shape observed in the real file — all
 * companies invented.
 */

const FIXTURE = `# Pipeline — Pending URLs

Paste job URLs below as \`- [ ] {url}\` then run \`/career-ops pipeline\`.

## Pending
<!-- Scan 2026-06-20 comment line — must be ignored -->
- [ ] https://jobs.example.com/nimbus/design-engineer | Nimbus Labs | Design Engineer | Remote EU | ⭐ exact stack
- [ ] https://jobs.example.com/vectorline/frontend
- [ ] https://boards.example.io/quartzworks/ui-engineer | Quartzworks | UI Engineer

## Processed
- [x] #028 | https://jobs.example.com/helioscope/product-engineer | Helioscope | Product Engineer | 3.2/5 | PDF ❌
- [x] #007 | https://jobs.example.com/lumen/frontend-ai | Lumen Systems | Frontend AI | 4.1/5 | PDF ✅
- [screened] Batch scan 2026-06-20 : ~12 offers screened out (US-only), available on request.
- [dup] https://jobs.example.com/helioscope/product-engineer-eu | Helioscope | Product Engineer (EU) | duplicate of #028
- [skip] Parallax Digital (MENA) | Creative Developer | SKIP — out of geo scope
`;

describe("parsePipeline", () => {
  const items = parsePipeline(FIXTURE);

  it("keeps file order and finds every item line, skipping prose/comments", () => {
    expect(items).toHaveLength(8);
    expect(items.map((i) => i.kind)).toEqual([
      "pending",
      "pending",
      "pending",
      "done",
      "done",
      "screened",
      "dup",
      "skip",
    ]);
  });

  it("assigns sections from the headings", () => {
    expect(items.slice(0, 3).every((i) => i.section === "pending")).toBe(true);
    expect(items.slice(3).every((i) => i.section === "processed")).toBe(true);
  });

  it("parses pending rows: url, company, role (meta cells stay in raw only)", () => {
    const [full, bare, partial] = items;
    expect(full.url).toBe("https://jobs.example.com/nimbus/design-engineer");
    expect(full.company).toBe("Nimbus Labs");
    expect(full.role).toBe("Design Engineer");
    expect(full.reportNum).toBeNull();
    expect(full.scoreRaw).toBeNull();
    expect(full.raw).toContain("⭐ exact stack");

    expect(bare.url).toBe("https://jobs.example.com/vectorline/frontend");
    expect(bare.company).toBeNull();
    expect(bare.role).toBeNull();

    expect(partial.company).toBe("Quartzworks");
    expect(partial.role).toBe("UI Engineer");
  });

  it("parses done rows: report num, url, company, role, score; PDF cell dropped", () => {
    const done = items[3];
    expect(done.reportNum).toBe(28);
    expect(done.url).toBe("https://jobs.example.com/helioscope/product-engineer");
    expect(done.company).toBe("Helioscope");
    expect(done.role).toBe("Product Engineer");
    expect(done.scoreRaw).toBe("3.2/5");
    // PDF cell must not leak into company/role.
    expect(done.role).not.toMatch(/PDF/);
    expect(items[4].scoreRaw).toBe("4.1/5");
  });

  it("keeps screened batch summaries as raw prose (no company/role guessing)", () => {
    const screened = items[5];
    expect(screened.company).toBeNull();
    expect(screened.role).toBeNull();
    expect(screened.url).toBeNull();
    expect(screened.raw).toContain("~12 offers screened out");
  });

  it("parses dup rows with url and skip rows without one", () => {
    const dup = items[6];
    expect(dup.url).toBe("https://jobs.example.com/helioscope/product-engineer-eu");
    expect(dup.company).toBe("Helioscope");

    const skip = items[7];
    expect(skip.url).toBeNull();
    expect(skip.company).toBe("Parallax Digital (MENA)");
    expect(skip.role).toBe("Creative Developer");
  });

  it("never loses the original line", () => {
    for (const item of items) {
      expect(FIXTURE).toContain(item.raw);
    }
  });

  it("returns [] on an empty or heading-only file", () => {
    expect(parsePipeline("")).toEqual([]);
    expect(parsePipeline("## Pending\n\n## Processed\n")).toEqual([]);
  });

  it("infers a section from the kind when items appear before any heading", () => {
    const noHeadings = parsePipeline(
      "- [ ] https://jobs.example.com/a | A Corp | Role\n- [x] #001 | https://jobs.example.com/b | B Corp | Role | 3.0/5 | PDF ❌\n",
    );
    expect(noHeadings[0].section).toBe("pending");
    expect(noHeadings[1].section).toBe("processed");
  });
});

describe("parsePipeline — manual [!] offers (dashboard-added, un-fetchable JD)", () => {
  it("recognizes [!] as a manual pending item and captures the local JD ref", () => {
    const items = parsePipeline(
      "## Pending\n- [!] https://www.welcometothejungle.com/fr/companies/acme/jobs/frontend | local:jds/007-welcometothejungle-frontend.md | note: added via dashboard 2026-07-11\n",
    );
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item.kind).toBe("manual");
    expect(item.section).toBe("pending");
    expect(item.url).toBe(
      "https://www.welcometothejungle.com/fr/companies/acme/jobs/frontend",
    );
    expect(item.localJd).toBe("jds/007-welcometothejungle-frontend.md");
  });

  it("keeps company/role null when absent — local:/note: never leak into them", () => {
    const [item] = parsePipeline(
      "- [!] https://linkedin.com/jobs/view/42 | local:jds/008-linkedin-42.md | note: manual\n",
    );
    expect(item.company).toBeNull();
    expect(item.role).toBeNull();
    expect(item.localJd).toBe("jds/008-linkedin-42.md");
  });

  it("still parses company/role when the manual line carries them", () => {
    const [item] = parsePipeline(
      "- [!] https://linkedin.com/jobs/view/9 | Larkspur | Frontend Engineer | local:jds/009-larkspur.md\n",
    );
    expect(item.company).toBe("Larkspur");
    expect(item.role).toBe("Frontend Engineer");
    expect(item.localJd).toBe("jds/009-larkspur.md");
  });

  it("defaults localJd to null for non-manual rows", () => {
    const [pending] = parsePipeline("- [ ] https://jobs.example.com/x | X Co | Role\n");
    expect(pending.localJd).toBeNull();
  });
});
