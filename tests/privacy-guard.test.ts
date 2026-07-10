import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

/**
 * Privacy-guard mechanics (M7, plan §7) — exercised against a SYNTHETIC
 * blocklist in a throwaway git repo, so the test itself ships zero sensitive
 * tokens. The real blocklist's catch behavior was additionally proven with a
 * seeded canary during M7 verification (see HANDOFF).
 */

const require = createRequire(import.meta.url);
const GUARD = path.join(process.cwd(), "scripts", "privacy-guard.mjs");
// privacy-lib is ESM — import dynamically inside the test.

function runGuard(args: string[]): { code: number; output: string } {
  try {
    const output = execFileSync(process.execPath, [GUARD, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "privacy-guard-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

async function makeRepo(files: Record<string, string>): Promise<string> {
  const { hashToken } = await import("../scripts/privacy-lib.mjs");
  const dir = mkdtempSync(path.join(tmp, "repo-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }
  execFileSync("git", ["add", "."], { cwd: dir });
  // Synthetic blocklist: an invented "sensitive" word + a bigram + an email.
  writeFileSync(
    path.join(dir, "blocklist.json"),
    JSON.stringify({
      hashes: [
        hashToken("zephyrion"),
        hashToken("umbra collective"),
        hashToken("jane.zephyrion@example.com"),
      ],
    }),
  );
  return dir;
}

describe("privacy-guard.mjs", () => {
  it("passes a clean repo", async () => {
    const dir = await makeRepo({ "src/a.ts": "export const ok = 'nothing to see';" });
    const res = runGuard(["--dir", dir, "--blocklist", path.join(dir, "blocklist.json")]);
    expect(res.output).toContain("clean");
    expect(res.code).toBe(0);
  });

  it("catches a blocked single token, case- and accent-insensitively", async () => {
    const dir = await makeRepo({ "src/leak.ts": "const c = 'Zéphyrion Industries';" });
    const res = runGuard(["--dir", dir, "--blocklist", path.join(dir, "blocklist.json")]);
    expect(res.code).toBe(1);
    expect(res.output).toContain("LEAK");
    expect(res.output).toContain("src/leak.ts");
    // never prints the token itself
    expect(res.output.toLowerCase()).not.toContain("zephyrion");
  });

  it("catches a blocked bigram across word boundaries", async () => {
    const dir = await makeRepo({ "docs/note.md": "worked with Umbra Collective last year" });
    const res = runGuard(["--dir", dir, "--blocklist", path.join(dir, "blocklist.json")]);
    expect(res.code).toBe(1);
    expect(res.output).toContain("docs/note.md");
  });

  it("catches a blocked email compound", async () => {
    const dir = await makeRepo({ "a.txt": "contact: Jane.Zephyrion@example.com" });
    const res = runGuard(["--dir", dir, "--blocklist", path.join(dir, "blocklist.json")]);
    expect(res.code).toBe(1);
  });

  it("only scans committed/tracked files", async () => {
    const dir = await makeRepo({ "clean.ts": "export {};" });
    // untracked leak file — must NOT fail the guard
    writeFileSync(path.join(dir, "untracked.ts"), "zephyrion");
    const res = runGuard(["--dir", dir, "--blocklist", path.join(dir, "blocklist.json")]);
    expect(res.code).toBe(0);
  });

  it("refuses to pass vacuously on an empty blocklist", async () => {
    const dir = await makeRepo({ "a.ts": "export {};" });
    writeFileSync(path.join(dir, "blocklist.json"), JSON.stringify({ hashes: [] }));
    const res = runGuard(["--dir", dir, "--blocklist", path.join(dir, "blocklist.json")]);
    expect(res.code).toBe(2);
  });

  it("the committed real blocklist is non-empty and never contains plaintext", () => {
    const blocklist = require("../scripts/privacy-blocklist.json") as {
      hashes: string[];
    };
    expect(blocklist.hashes.length).toBeGreaterThan(20);
    for (const h of blocklist.hashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the demo fixtures pass the real guard (no blocked token in fixtures/)", () => {
    // Run the actual guard over the actual repo — the CI gate, exercised here.
    const res = runGuard([]);
    expect(res.output).toContain("clean");
    expect(res.code).toBe(0);
  });
});
