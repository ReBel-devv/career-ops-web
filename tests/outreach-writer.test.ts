import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  acquireOutreachLock,
  addOutreachContact,
  deleteOutreachContact,
  outreachPathFor,
  parseOutreachDoc,
  serializeOutreachDoc,
  updateOutreachContact,
} from "@/lib/writers";
import { outreachDocSchema } from "@/lib/domain";

/**
 * Outreach writer tests — plain OS temp dirs only (the writer touches nothing
 * but data/outreach.yml, so no data-repo copy is needed and the suite ALWAYS
 * runs). Covers: file creation with the schema header, add/update/delete
 * round-trips, unrestricted stage moves (skip + regress, non-destructive
 * dates), sanitization, zod rejections, the malformed-file guard, and the lock.
 */

let root: string;
let outreachPath: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "career-ops-outreach-test-"));
  outreachPath = outreachPathFor(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const BASE_CONTACT = {
  kind: "recruiter" as const,
  name: "Maya Lindqvist",
  linkedin: "https://www.linkedin.com/in/maya-demo",
  companyRole: "Technical Recruiter",
  notes: "Warm intro via meetup",
};

describe("outreach writer — file lifecycle", () => {
  it("creates outreach.yml with the schema comment header when absent", async () => {
    const result = await addOutreachContact(root, {
      appNum: 3,
      ...BASE_CONTACT,
      date: "2026-07-01",
    });

    const content = await fs.readFile(outreachPath, "utf8");
    expect(content.startsWith("# career-ops — LinkedIn / recruiter outreach tracker")).toBe(true);
    expect(content).toContain("stage: identified | requested | accepted | messaged | replied");
    expect(content).toContain("version: 1");

    expect(result.contact?.name).toBe("Maya Lindqvist");
    expect(result.contact?.stage).toBe("identified");
    expect(result.contact?.stageDates).toEqual({ identified: "2026-07-01" });

    // Round-trip: the file re-parses into the same validated document.
    const doc = parseOutreachDoc(content);
    expect(doc.version).toBe(1);
    expect(doc.applications["3"]).toHaveLength(1);
    expect(doc.applications["3"][0]).toEqual(result.contact);
  });

  it("keeps the header + other apps intact across successive writes", async () => {
    await addOutreachContact(root, { appNum: 1, ...BASE_CONTACT, date: "2026-07-01" });
    await addOutreachContact(root, {
      appNum: 7,
      kind: "peer",
      name: "Jonas Reber",
      date: "2026-07-02",
    });

    const content = await fs.readFile(outreachPath, "utf8");
    expect(content.startsWith("# career-ops — LinkedIn / recruiter outreach tracker")).toBe(true);
    const doc = parseOutreachDoc(content);
    expect(Object.keys(doc.applications).sort()).toEqual(["1", "7"]);
    expect(doc.applications["1"][0].name).toBe("Maya Lindqvist");
    expect(doc.applications["7"][0].kind).toBe("peer");
  });

  it("refuses to overwrite a malformed existing file (PARSE_FAILED)", async () => {
    await fs.mkdir(path.dirname(outreachPath), { recursive: true });
    const garbage = "applications:\n  '1':\n    - kind: alien\n      name: X\n      stage: warp\n";
    await fs.writeFile(outreachPath, garbage);

    await expect(
      addOutreachContact(root, { appNum: 1, ...BASE_CONTACT }),
    ).rejects.toMatchObject({ code: "PARSE_FAILED" });
    // File left exactly as it was.
    expect(await fs.readFile(outreachPath, "utf8")).toBe(garbage);
  });

  it("rejects an invalid app num / calendar date before touching the file", async () => {
    await expect(
      addOutreachContact(root, { appNum: 0, ...BASE_CONTACT }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      addOutreachContact(root, { appNum: 1, ...BASE_CONTACT, date: "2026-02-30" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(fs.readFile(outreachPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects a whitespace-only name (INVALID_INPUT)", async () => {
    await expect(
      addOutreachContact(root, { appNum: 1, kind: "peer", name: "   " }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("outreach writer — stage machine", () => {
  it("advance stamps the stage date and keeps earlier stamps", async () => {
    const added = await addOutreachContact(root, {
      appNum: 2,
      ...BASE_CONTACT,
      date: "2026-07-01",
    });
    const id = added.contact!.id;

    const requested = await updateOutreachContact(root, {
      appNum: 2,
      contactId: id,
      stage: "requested",
      date: "2026-07-03",
    });
    expect(requested.contact?.stage).toBe("requested");
    expect(requested.contact?.stageDates).toEqual({
      identified: "2026-07-01",
      requested: "2026-07-03",
    });
  });

  it("allows skipping stages (identified → messaged)", async () => {
    const added = await addOutreachContact(root, {
      appNum: 2,
      ...BASE_CONTACT,
      date: "2026-07-01",
    });
    const skipped = await updateOutreachContact(root, {
      appNum: 2,
      contactId: added.contact!.id,
      stage: "messaged",
      date: "2026-07-05",
    });
    expect(skipped.contact?.stage).toBe("messaged");
    // Skipped intermediate stages carry no dates.
    expect(skipped.contact?.stageDates).toEqual({
      identified: "2026-07-01",
      messaged: "2026-07-05",
    });
  });

  it("allows regressions and keeps them non-destructive (undo semantics)", async () => {
    const added = await addOutreachContact(root, {
      appNum: 2,
      ...BASE_CONTACT,
      date: "2026-07-01",
    });
    const id = added.contact!.id;
    await updateOutreachContact(root, {
      appNum: 2,
      contactId: id,
      stage: "accepted",
      date: "2026-07-04",
    });
    const back = await updateOutreachContact(root, {
      appNum: 2,
      contactId: id,
      stage: "identified",
      date: "2026-07-01",
    });
    expect(back.contact?.stage).toBe("identified");
    // The accepted stamp survives the regression — nothing is deleted.
    expect(back.contact?.stageDates).toEqual({
      identified: "2026-07-01",
      accepted: "2026-07-04",
    });
  });
});

describe("outreach writer — edit / delete", () => {
  it("edits fields and clears them with null", async () => {
    const added = await addOutreachContact(root, { appNum: 5, ...BASE_CONTACT });
    const edited = await updateOutreachContact(root, {
      appNum: 5,
      contactId: added.contact!.id,
      kind: "hiring-manager",
      name: "Maya L.",
      notes: null,
      linkedin: null,
    });
    expect(edited.contact).toMatchObject({ kind: "hiring-manager", name: "Maya L." });
    expect(edited.contact?.notes).toBeUndefined();
    expect(edited.contact?.linkedin).toBeUndefined();

    const doc = parseOutreachDoc(await fs.readFile(outreachPath, "utf8"));
    expect(doc.applications["5"][0].notes).toBeUndefined();
  });

  it("sanitizes pipes/newlines in name and notes", async () => {
    const added = await addOutreachContact(root, {
      appNum: 5,
      kind: "peer",
      name: "Two\nLines | Pipe",
      notes: "note\nwith | pipe",
    });
    expect(added.contact?.name).toBe("Two Lines / Pipe");
    expect(added.contact?.notes).toBe("note with / pipe");
  });

  it("deletes a contact and drops the app key when the list empties", async () => {
    const a = await addOutreachContact(root, { appNum: 9, ...BASE_CONTACT });
    await addOutreachContact(root, { appNum: 11, kind: "founder", name: "P. N." });

    const afterDelete = await deleteOutreachContact(root, {
      appNum: 9,
      contactId: a.contact!.id,
    });
    expect(afterDelete.contacts).toEqual([]);

    const doc = parseOutreachDoc(await fs.readFile(outreachPath, "utf8"));
    expect(doc.applications["9"]).toBeUndefined();
    expect(doc.applications["11"]).toHaveLength(1);
  });

  it("NOT_FOUND on unknown contact ids", async () => {
    await addOutreachContact(root, { appNum: 9, ...BASE_CONTACT });
    await expect(
      updateOutreachContact(root, { appNum: 9, contactId: "c_nope", stage: "replied" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      deleteOutreachContact(root, { appNum: 9, contactId: "c_nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("outreach writer — lock", () => {
  it("times out with LOCK_TIMEOUT while the lock is held", async () => {
    const lock = await acquireOutreachLock(outreachPath);
    try {
      await expect(
        addOutreachContact(root, { appNum: 1, ...BASE_CONTACT }, { timeoutMs: 300 }),
      ).rejects.toMatchObject({ code: "LOCK_TIMEOUT" });
    } finally {
      lock.release();
    }
    // Lock released → the same write succeeds.
    const result = await addOutreachContact(root, { appNum: 1, ...BASE_CONTACT });
    expect(result.contacts).toHaveLength(1);
  });

  it("serializes concurrent adds — both land, none lost", async () => {
    const [a, b] = await Promise.all([
      addOutreachContact(root, { appNum: 4, kind: "peer", name: "Contact A" }),
      addOutreachContact(root, { appNum: 4, kind: "founder", name: "Contact B" }),
    ]);
    expect(a.contact?.id).not.toBe(b.contact?.id);
    const doc = parseOutreachDoc(await fs.readFile(outreachPath, "utf8"));
    expect(doc.applications["4"].map((c) => c.name).sort()).toEqual([
      "Contact A",
      "Contact B",
    ]);
  });
});

describe("outreach document schema (zod rejections)", () => {
  const validContact = {
    id: "c_1",
    kind: "recruiter",
    name: "X",
    stage: "identified",
    stageDates: { identified: "2026-07-01" },
  };

  it("rejects a bad contact kind", () => {
    const doc = {
      version: 1,
      applications: { "1": [{ ...validContact, kind: "alien" }] },
    };
    expect(outreachDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a bad stage", () => {
    const doc = {
      version: 1,
      applications: { "1": [{ ...validContact, stage: "warp" }] },
    };
    expect(outreachDocSchema.safeParse(doc).success).toBe(false);
  });

  it("rejects a bad stageDates key and a bad date format", () => {
    expect(
      outreachDocSchema.safeParse({
        version: 1,
        applications: { "1": [{ ...validContact, stageDates: { bogus: "2026-07-01" } }] },
      }).success,
    ).toBe(false);
    expect(
      outreachDocSchema.safeParse({
        version: 1,
        applications: { "1": [{ ...validContact, stageDates: { identified: "07/01/2026" } }] },
      }).success,
    ).toBe(false);
  });

  it("parseOutreachDoc maps snake_case YAML and rejects malformed docs", () => {
    const yaml = [
      "version: 1",
      "applications:",
      "  '2':",
      "    - id: c_ab12",
      "      kind: hiring-manager",
      "      name: Jonas Reber",
      "      company_role: Engineering Manager",
      "      stage: requested",
      "      stage_dates:",
      "        identified: 2026-07-01",
      "        requested: 2026-07-02",
    ].join("\n");
    const doc = parseOutreachDoc(yaml);
    expect(doc.applications["2"][0]).toMatchObject({
      kind: "hiring-manager",
      companyRole: "Engineering Manager",
      stage: "requested",
      stageDates: { identified: "2026-07-01", requested: "2026-07-02" },
    });

    expect(() => parseOutreachDoc("just a string")).toThrow();
    // Empty / comment-only content → the empty document.
    expect(parseOutreachDoc("").applications).toEqual({});
    expect(parseOutreachDoc("# only comments\n").applications).toEqual({});
  });

  it("serializeOutreachDoc emits YAML dates as strings (round-trip safe)", () => {
    // js-yaml would parse a bare 2026-07-01 as a string only under the core
    // schema for dates without time — assert the full loop stays stringly.
    const doc = outreachDocSchema.parse({
      version: 1,
      applications: { "1": [validContact] },
    });
    const text = serializeOutreachDoc(doc);
    const reparsed = parseOutreachDoc(text);
    expect(reparsed).toEqual(doc);
  });
});
