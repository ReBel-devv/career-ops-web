/**
 * /api/outreach route tests — HTTP mapping (200/400/403/404) against a temp
 * copy of the tracker (FS mode, skipped without CAREER_OPS_PATH) and the
 * in-memory demo mode. The real data repo is never written.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET as GET_ALL } from "@/app/api/outreach/route";
import { GET as GET_ONE, POST } from "@/app/api/outreach/[num]/route";
import { DELETE, PATCH } from "@/app/api/outreach/[num]/[contactId]/route";
import { parseOutreachDoc } from "@/lib/writers";
import {
  createTempRepo,
  dataRepoPath,
  SYNTHETIC_TRACKER,
  type TempRepo,
} from "./helpers/temp-repo";

const REPO = dataRepoPath();

const ENV_KEYS = ["CAREER_OPS_PATH", "DEMO_MODE", "READ_ONLY"] as const;
const savedEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((k) => [k, process.env[k]]),
);
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function fsModeRepo(): Promise<TempRepo> {
  const repo = await createTempRepo(REPO!, SYNTHETIC_TRACKER);
  cleanups.push(repo.cleanup);
  process.env.CAREER_OPS_PATH = repo.root;
  delete process.env.DEMO_MODE;
  delete process.env.READ_ONLY;
  return repo;
}

function jsonRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/outreach", {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const params = (num: string) => ({ params: Promise.resolve({ num }) });
const cParams = (num: string, contactId: string) => ({
  params: Promise.resolve({ num, contactId }),
});

const ADD_BODY = {
  kind: "recruiter",
  name: "Maya Lindqvist",
  companyRole: "Technical Recruiter",
  date: "2026-07-01",
};

describe.skipIf(!REPO)("/api/outreach — FS mode (temp repo)", () => {
  it("add → set stage → list → delete round-trip, file stays valid YAML", async () => {
    const repo = await fsModeRepo();
    const outreachPath = path.join(repo.root, "data", "outreach.yml");

    // POST add
    const addRes = await POST(jsonRequest("POST", ADD_BODY), params("1"));
    expect(addRes.status).toBe(200);
    const added = (await addRes.json()) as {
      contact?: { id: string; stage: string; stageDates: Record<string, string> };
      contacts: unknown[];
    };
    expect(added.contact?.stage).toBe("identified");
    expect(added.contacts).toHaveLength(1);

    // PATCH stage advance with a date
    const patchRes = await PATCH(
      jsonRequest("PATCH", { stage: "requested", date: "2026-07-03" }),
      cParams("1", added.contact!.id),
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as {
      contact?: { stage: string; stageDates: Record<string, string> };
    };
    expect(patched.contact?.stage).toBe("requested");
    expect(patched.contact?.stageDates).toEqual({
      identified: "2026-07-01",
      requested: "2026-07-03",
    });

    // File on disk is valid YAML with the schema header and re-parses.
    const content = await fs.readFile(outreachPath, "utf8");
    expect(content.startsWith("# career-ops — LinkedIn / recruiter outreach tracker")).toBe(true);
    const doc = parseOutreachDoc(content);
    expect(doc.applications["1"][0].stage).toBe("requested");

    // GET list (all + per-app)
    const allRes = await GET_ALL();
    expect(allRes.status).toBe(200);
    const all = (await allRes.json()) as { records: { appNum: number }[] };
    expect(all.records.map((r) => r.appNum)).toEqual([1]);

    const oneRes = await GET_ONE(jsonRequest("GET"), params("1"));
    const one = (await oneRes.json()) as { contacts: unknown[] };
    expect(one.contacts).toHaveLength(1);

    // DELETE
    const delRes = await DELETE(jsonRequest("DELETE"), cParams("1", added.contact!.id));
    expect(delRes.status).toBe(200);
    const afterDoc = parseOutreachDoc(await fs.readFile(outreachPath, "utf8"));
    expect(afterDoc.applications["1"]).toBeUndefined();
  });

  it("404s an app num missing from the tracker", async () => {
    await fsModeRepo();
    const res = await POST(jsonRequest("POST", ADD_BODY), params("999"));
    expect(res.status).toBe(404);
  });

  it("400s bad bodies and segments", async () => {
    await fsModeRepo();
    expect((await POST(jsonRequest("POST", { name: "No Kind" }), params("1"))).status).toBe(400);
    expect(
      (await POST(jsonRequest("POST", { ...ADD_BODY, kind: "alien" }), params("1"))).status,
    ).toBe(400);
    expect((await POST(jsonRequest("POST", ADD_BODY), params("abc"))).status).toBe(400);
    expect(
      (await PATCH(jsonRequest("PATCH", {}), cParams("1", "c_x"))).status,
    ).toBe(400); // empty update body
    expect(
      (await PATCH(jsonRequest("PATCH", { stage: "warp" }), cParams("1", "c_x"))).status,
    ).toBe(400);
    expect(
      (await DELETE(jsonRequest("DELETE"), cParams("1", "../../etc"))).status,
    ).toBe(400); // invalid contact id shape
  });

  it("404s an unknown contact id", async () => {
    await fsModeRepo();
    await POST(jsonRequest("POST", ADD_BODY), params("1"));
    const res = await PATCH(
      jsonRequest("PATCH", { stage: "accepted" }),
      cParams("1", "c_missing"),
    );
    expect(res.status).toBe(404);
  });

  it("403s all mutations when READ_ONLY is set (file untouched)", async () => {
    const repo = await fsModeRepo();
    process.env.READ_ONLY = "true";
    expect((await POST(jsonRequest("POST", ADD_BODY), params("1"))).status).toBe(403);
    expect(
      (await PATCH(jsonRequest("PATCH", { stage: "accepted" }), cParams("1", "c_x"))).status,
    ).toBe(403);
    expect((await DELETE(jsonRequest("DELETE"), cParams("1", "c_x"))).status).toBe(403);
    await expect(
      fs.access(path.join(repo.root, "data", "outreach.yml")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("GET returns [] when outreach.yml doesn't exist", async () => {
    await fsModeRepo();
    const res = await GET_ALL();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { records: unknown[] }).records).toEqual([]);
  });
});

describe("/api/outreach — demo mode (in-memory)", () => {
  function demoEnv() {
    process.env.DEMO_MODE = "true";
    delete process.env.CAREER_OPS_PATH;
    delete process.env.READ_ONLY;
  }

  it("adds + advances a contact entirely in memory", async () => {
    demoEnv();
    const addRes = await POST(
      jsonRequest("POST", { kind: "peer", name: "Demo Peer", date: "2026-07-01" }),
      params("2"),
    );
    expect(addRes.status).toBe(200);
    const added = (await addRes.json()) as { contact?: { id: string } };

    const patchRes = await PATCH(
      jsonRequest("PATCH", { stage: "replied", date: "2026-07-05" }),
      cParams("2", added.contact!.id),
    );
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { contact?: { stage: string } };
    expect(patched.contact?.stage).toBe("replied");

    // Cleanup the in-memory contact so other suites see pristine demo data.
    const delRes = await DELETE(jsonRequest("DELETE"), cParams("2", added.contact!.id));
    expect(delRes.status).toBe(200);
  });

  it("serves the seeded demo contacts and 404s unknown demo apps", async () => {
    demoEnv();
    const res = await GET_ALL();
    const body = (await res.json()) as { records: { appNum: number }[] };
    expect(body.records.some((r) => r.appNum === 1)).toBe(true);

    const bad = await POST(jsonRequest("POST", ADD_BODY), params("999"));
    expect(bad.status).toBe(404);
  });
});
