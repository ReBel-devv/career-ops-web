import { describe, expect, it } from "vitest";
import { assertDeployGuard, getConfig, isTruthyEnv, requireCareerOpsPath } from "@/lib/config";

describe("assertDeployGuard", () => {
  it("fails a Vercel build without DEMO_MODE", () => {
    expect(() => assertDeployGuard({ VERCEL: "1" })).toThrow(/DEMO_MODE/);
  });

  it("fails a Vercel build with a falsy DEMO_MODE value", () => {
    expect(() => assertDeployGuard({ VERCEL: "1", DEMO_MODE: "false" })).toThrow(/DEMO_MODE/);
    expect(() => assertDeployGuard({ VERCEL: "1", DEMO_MODE: "0" })).toThrow(/DEMO_MODE/);
    expect(() => assertDeployGuard({ VERCEL: "1", DEMO_MODE: "" })).toThrow(/DEMO_MODE/);
  });

  it("allows a Vercel build in demo mode", () => {
    expect(() => assertDeployGuard({ VERCEL: "1", DEMO_MODE: "true" })).not.toThrow();
    expect(() => assertDeployGuard({ VERCEL: "1", DEMO_MODE: "1" })).not.toThrow();
  });

  it("allows local builds regardless of DEMO_MODE", () => {
    expect(() => assertDeployGuard({})).not.toThrow();
    expect(() => assertDeployGuard({ DEMO_MODE: "false" })).not.toThrow();
  });
});

describe("getConfig", () => {
  it("parses env into a typed config", () => {
    const config = getConfig({
      CAREER_OPS_PATH: "/tmp/repo",
      DEMO_MODE: "true",
      READ_ONLY: "yes",
    });
    // Demo mode force-disables the assistant (and therefore writability).
    expect(config).toEqual({
      careerOpsPath: "/tmp/repo",
      demoMode: true,
      readOnly: true,
      assistantEnabled: false,
      assistantWritable: false,
    });
  });

  it("treats blank CAREER_OPS_PATH as unset", () => {
    const config = getConfig({ CAREER_OPS_PATH: "  " });
    expect(config.careerOpsPath).toBeNull();
    expect(config.demoMode).toBe(false);
    expect(config.readOnly).toBe(false);
  });
});

describe("requireCareerOpsPath", () => {
  it("throws an actionable error when unset", () => {
    expect(() => requireCareerOpsPath({})).toThrow(/CAREER_OPS_PATH/);
  });

  it("returns the path when set", () => {
    expect(requireCareerOpsPath({ CAREER_OPS_PATH: "/tmp/repo" })).toBe("/tmp/repo");
  });
});

describe("isTruthyEnv", () => {
  it("accepts 1/true/yes/on case-insensitively", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on", " True "]) {
      expect(isTruthyEnv(v)).toBe(true);
    }
    for (const v of [undefined, "", "0", "false", "off", "no"]) {
      expect(isTruthyEnv(v)).toBe(false);
    }
  });
});
