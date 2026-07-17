import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTemplate,
  listTemplates,
  readTemplate,
  readTemplateVersion,
  saveTemplate,
  templateSlugFromTitle,
  TemplateWriteError,
} from "@/lib/writers";

/** Each test gets a throwaway repo dir — the real data repo is never touched. */
let repo: string;

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "career-ops-templates-test-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("templateSlugFromTitle", () => {
  it("slugifies accents, punctuation and length", () => {
    expect(templateSlugFromTitle("Contacter un recruteur IT (LinkedIn) !")).toBe(
      "contacter-un-recruteur-it-linkedin",
    );
    expect(templateSlugFromTitle("Éàç — test")).toBe("eac-test");
    expect(templateSlugFromTitle("   ")).toBe("template");
  });
});

describe("createTemplate", () => {
  it("writes v1 (current file + one history entry)", async () => {
    const detail = await createTemplate(repo, {
      title: "LinkedIn intro",
      type: "linkedin",
      body: "Bonjour !",
      source: "manual",
    });
    expect(detail.template.slug).toBe("linkedin-intro");
    expect(detail.template.body).toBe("Bonjour !");
    expect(detail.versions).toHaveLength(1);
    expect(detail.versions[0]).toMatchObject({ version: 1, source: "manual" });

    // Current file is plain markdown with frontmatter.
    const current = readFileSync(
      path.join(repo, "templates", "messages", "linkedin-intro.md"),
      "utf8",
    );
    expect(current).toContain('title: "LinkedIn intro"');
    expect(current).toContain("Bonjour !");
    expect(
      readdirSync(path.join(repo, "templates", "messages", "history", "linkedin-intro")),
    ).toEqual(["001-manual.md"]);
  });

  it("dedupes slugs when titles collide", async () => {
    await createTemplate(repo, { title: "Intro", body: "a", source: "manual" });
    const second = await createTemplate(repo, {
      title: "Intro",
      body: "b",
      source: "manual",
    });
    expect(second.template.slug).toBe("intro-2");
  });
});

describe("saveTemplate", () => {
  it("appends v2 and rewrites the current file", async () => {
    const v1 = await createTemplate(repo, {
      title: "Intro",
      body: "first",
      source: "manual",
    });
    const v2 = await saveTemplate(repo, {
      slug: "intro",
      title: "Intro",
      type: "email",
      body: "second",
      source: "agent",
      note: "make it shorter",
      expectedSavedAt: v1.template.savedAt,
    });
    expect(v2.template.body).toBe("second");
    expect(v2.template.type).toBe("email");
    expect(v2.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(v2.versions[0]).toMatchObject({ source: "agent", note: "make it shorter" });

    const old = await readTemplateVersion(repo, "intro", 1);
    expect(old?.body).toBe("first");
  });

  it("rejects a stale expectedSavedAt with STALE_TEMPLATE", async () => {
    const v1 = await createTemplate(repo, {
      title: "Intro",
      body: "first",
      source: "manual",
    });
    await saveTemplate(repo, {
      slug: "intro",
      title: "Intro",
      body: "second",
      source: "manual",
      expectedSavedAt: v1.template.savedAt,
    });
    await expect(
      saveTemplate(repo, {
        slug: "intro",
        title: "Intro",
        body: "third",
        source: "manual",
        expectedSavedAt: v1.template.savedAt, // stale — v2 exists now
      }),
    ).rejects.toMatchObject({ code: "STALE_TEMPLATE" });
  });

  it("404s on a missing template and rejects bad slugs", async () => {
    await expect(
      saveTemplate(repo, {
        slug: "nope",
        title: "T",
        body: "b",
        source: "manual",
        expectedSavedAt: "x",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveTemplate(repo, {
        slug: "../escape",
        title: "T",
        body: "b",
        source: "manual",
        expectedSavedAt: "x",
      }),
    ).rejects.toBeInstanceOf(TemplateWriteError);
  });

  it("snapshots a hand-edited current file before overwriting it", async () => {
    const v1 = await createTemplate(repo, {
      title: "Intro",
      body: "first",
      source: "manual",
    });
    // Hand edit that bypasses the dashboard (keeps the same saved_at).
    const currentPath = path.join(repo, "templates", "messages", "intro.md");
    writeFileSync(
      currentPath,
      readFileSync(currentPath, "utf8").replace("first", "hand-edited"),
    );

    const next = await saveTemplate(repo, {
      slug: "intro",
      title: "Intro",
      body: "dashboard save",
      source: "manual",
      expectedSavedAt: v1.template.savedAt,
    });
    // v2 = the snapshot of the hand edit, v3 = the dashboard save.
    expect(next.versions.map((v) => [v.version, v.source])).toEqual([
      [3, "manual"],
      [2, "snapshot"],
      [1, "manual"],
    ]);
    const snapshot = await readTemplateVersion(repo, "intro", 2);
    expect(snapshot?.body).toBe("hand-edited");
    expect(next.template.body).toBe("dashboard save");
  });
});

describe("reads", () => {
  it("lists templates newest-saved first with excerpt + version count", async () => {
    await createTemplate(repo, { title: "Old", body: "old body", source: "manual" });
    await new Promise((r) => setTimeout(r, 5)); // distinct saved_at
    await createTemplate(repo, {
      title: "New",
      body: "\n\n  new body first line\nsecond",
      source: "manual",
    });
    const list = await listTemplates(repo);
    expect(list.map((t) => t.title)).toEqual(["New", "Old"]);
    expect(list[0]).toMatchObject({ versionCount: 1, excerpt: "new body first line" });
  });

  it("returns null for a missing template or version", async () => {
    expect(await readTemplate(repo, "nope")).toBeNull();
    expect(await readTemplateVersion(repo, "nope", 1)).toBeNull();
    expect(await readTemplate(repo, "../../etc/passwd")).toBeNull();
  });

  it("reads a handwritten current file (no frontmatter) gracefully", async () => {
    const dir = path.join(repo, "templates", "messages");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "handmade.md"), "# Handmade\n\ntext");
    const detail = await readTemplate(repo, "handmade");
    expect(detail?.template.title).toBe("Handmade");
    expect(detail?.versions).toEqual([]);
  });
});
