import { describe, expect, it } from "vitest";
import { parseTemplateFile, serializeTemplateFile } from "@/lib/parsers/template";

describe("parseTemplateFile", () => {
  it("round-trips through serializeTemplateFile", () => {
    const serialized = serializeTemplateFile({
      title: 'Contacter un recruteur "IT"',
      type: "linkedin",
      savedAt: "2026-07-16T21:00:00.000Z",
      source: "generated",
      note: "from prompt: recruteur IT",
      body: "Bonjour,\n\nJe vous contacte…\n",
    });
    const { meta, body } = parseTemplateFile(serialized);
    expect(meta).toEqual({
      title: 'Contacter un recruteur "IT"',
      type: "linkedin",
      savedAt: "2026-07-16T21:00:00.000Z",
      source: "generated",
      note: "from prompt: recruteur IT",
    });
    expect(body).toBe("Bonjour,\n\nJe vous contacte…");
  });

  it("parses a handwritten file with no frontmatter (title from heading)", () => {
    const { meta, body } = parseTemplateFile("# Mon template\n\nCorps du texte.");
    expect(meta.title).toBe("Mon template");
    expect(meta.savedAt).toBeNull();
    expect(meta.source).toBe("manual");
    expect(body).toBe("# Mon template\n\nCorps du texte.");
  });

  it("survives broken YAML frontmatter", () => {
    const { meta, body } = parseTemplateFile(
      "---\ntitle: [unclosed\n---\n\nStill readable.",
    );
    expect(meta.title).toBeNull();
    expect(body).toBe("Still readable.");
  });

  it("coerces unquoted ISO datetimes (js-yaml Date objects) back to strings", () => {
    const { meta } = parseTemplateFile(
      "---\ntitle: T\nsaved_at: 2026-07-16T21:00:00.000Z\n---\n\nbody",
    );
    expect(meta.savedAt).toBe("2026-07-16T21:00:00.000Z");
  });

  it("falls back to manual for unknown sources", () => {
    const { meta } = parseTemplateFile("---\ntitle: T\nsource: robot\n---\n\nbody");
    expect(meta.source).toBe("manual");
  });
});
