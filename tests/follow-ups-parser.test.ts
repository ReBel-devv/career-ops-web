/**
 * Read parser for data/follow-ups.md (M3): log table rows + pin lines
 * (`- next #N YYYY-MM-DD (set YYYY-MM-DD)`, last wins per app).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { latestPins, parseFollowUps } from "@/lib/parsers/follow-ups";

const SYNTH = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "synthetic",
  "data",
  "follow-ups.md",
);
const REAL = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "real",
  "data",
  "follow-ups.md",
);

describe("parseFollowUps — synthetic", () => {
  const data = parseFollowUps(readFileSync(SYNTH, "utf8"));

  it("parses the log table", () => {
    expect(data.logs).toHaveLength(2);
    expect(data.logs[0]).toMatchObject({
      num: 1,
      appNum: 1,
      date: "2026-06-08",
      company: "Nimbus Labs",
      channel: "email",
    });
    expect(data.logs[1].contact).toBe("");
  });

  it("parses all pins in file order", () => {
    expect(data.pins).toHaveLength(3);
    expect(data.pins[0]).toEqual({
      appNum: 1,
      date: "2026-06-15",
      setDate: "2026-06-01",
    });
  });

  it("last pin wins per appNum", () => {
    const pins = latestPins(data);
    expect(pins.get(1)?.date).toBe("2026-06-20");
    expect(pins.get(1)?.setDate).toBe("2026-06-08");
    expect(pins.get(2)?.date).toBe("2026-06-16");
  });
});

describe("parseFollowUps — malformed input", () => {
  it("returns empty data for empty / non-matching content", () => {
    expect(parseFollowUps("")).toEqual({ logs: [], pins: [] });
    expect(parseFollowUps("# Notes\n\njust prose\n")).toEqual({
      logs: [],
      pins: [],
    });
  });

  it("skips rows with non-numeric num/appNum", () => {
    const content = [
      "| num | appNum | date | company | role | channel | contact | notes |",
      "|---|---|---|---|---|---|---|---|",
      "| x | y | 2026-01-01 | A | B | email | | bad |",
      "| 3 | 7 | 2026-01-02 | A | B | email | | good |",
    ].join("\n");
    const data = parseFollowUps(content);
    expect(data.logs).toHaveLength(1);
    expect(data.logs[0].appNum).toBe(7);
  });

  it("ignores pin-like lines that do not fully match", () => {
    const data = parseFollowUps("- next #4 2026-13-99\n- next 5 (set 2026-01-01)\n");
    expect(data.pins).toEqual([]);
  });
});

describe.skipIf(!existsSync(REAL))("parseFollowUps — real file", () => {
  it("parses the real follow-ups file without loss", () => {
    const content = readFileSync(REAL, "utf8");
    const data = parseFollowUps(content);
    // Every `- next #N` line in the file must be captured.
    const rawPinCount = (content.match(/^- next #\d+/gm) ?? []).length;
    expect(data.pins).toHaveLength(rawPinCount);
    for (const pin of data.pins) {
      expect(pin.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(pin.setDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
