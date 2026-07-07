/**
 * PATCH /api/applications/[num] — HTTP mapping tests (400/403/404/409/200)
 * against a temp copy of the tracker. The route resolves its DataSource from
 * the environment at request time, so each test pins the env it needs.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { PATCH } from "@/app/api/applications/[num]/route";
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

function callPatch(num: string, body: unknown): ReturnType<typeof PATCH> {
  const request = new Request(`http://localhost/api/applications/${num}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: Promise.resolve({ num }) });
}

const expected = { company: "Vectorline", role: "Frontend Engineer" };

describe.skipIf(!REPO)("PATCH /api/applications/[num] — FS mode", () => {
  it("writes a status and returns the updated application", async () => {
    const repo = await fsModeRepo();
    const res = await callPatch("2", { status: "Interview", expected });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      application: { num: number; statusLabel: string | null };
      notesSanitized: boolean;
    };
    expect(body.application.num).toBe(2);
    expect(body.application.statusLabel).toBe("Interview");
    expect(readFileSync(repo.trackerPath, "utf8")).toContain(
      "| 3.1/5 | Interview |",
    );
  });

  it("404s an unknown application number", async () => {
    await fsModeRepo();
    const res = await callPatch("999", { status: "Applied", expected });
    expect(res.status).toBe(404);
  });

  it("409s when the expected company/role is stale", async () => {
    await fsModeRepo();
    const res = await callPatch("2", {
      status: "Applied",
      expected: { company: "Vectorline", role: "Someone Else's Role" },
    });
    expect(res.status).toBe(409);
  });

  it("400s a non-canonical status", async () => {
    await fsModeRepo();
    const res = await callPatch("2", { status: "Banana", expected });
    expect(res.status).toBe(400);
  });

  it("400s a body with neither status nor notes", async () => {
    await fsModeRepo();
    const res = await callPatch("2", { expected });
    expect(res.status).toBe(400);
  });

  it("400s a non-numeric num segment", async () => {
    await fsModeRepo();
    const res = await callPatch("abc", { status: "Applied", expected });
    expect(res.status).toBe(400);
  });

  it("403s every mutation when READ_ONLY is set", async () => {
    const repo = await fsModeRepo();
    process.env.READ_ONLY = "true";
    const res = await callPatch("2", { status: "Applied", expected });
    expect(res.status).toBe(403);
    expect(readFileSync(repo.trackerPath, "utf8")).toBe(SYNTHETIC_TRACKER);
  });
});

describe("PATCH /api/applications/[num] — demo mode", () => {
  it("performs an in-memory write without any filesystem repo", async () => {
    process.env.DEMO_MODE = "true";
    delete process.env.CAREER_OPS_PATH;
    delete process.env.READ_ONLY;
    const res = await callPatch("2", {
      status: "Interview",
      expected: { company: "Vectorline", role: "Frontend Engineer, Platform" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      application: { statusLabel: string | null };
    };
    expect(body.application.statusLabel).toBe("Interview");
  });

  it("409s a stale demo row too", async () => {
    process.env.DEMO_MODE = "true";
    const res = await callPatch("2", {
      status: "Applied",
      expected: { company: "Vectorline", role: "Wrong Role" },
    });
    expect(res.status).toBe(409);
  });
});
