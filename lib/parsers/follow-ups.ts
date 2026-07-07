import { followUpDataSchema, type FollowUpData } from "@/lib/domain";

/**
 * Pure read parser for `data/follow-ups.md` (plan §4.3). The file holds:
 *
 *   - a markdown table of logged follow-ups:
 *     `| num | appNum | date | company | role | channel | contact | notes |`
 *   - pin lines of the form `- next #N YYYY-MM-DD (set YYYY-MM-DD)`, appended
 *     by `followup-seed.mjs`. All pins are returned in file order; consumers
 *     apply last-wins per appNum (the schema doc + M4 cadence use it that way).
 *
 * Cadence math is NEVER computed here — M4 shells `followup-cadence.mjs --json`.
 * This is read-only; pin/log *writes* land in M4.
 */

const PIN_LINE =
  /^-\s*next\s+#(\d+)\s+(\d{4}-\d{2}-\d{2})\s*\(set\s+(\d{4}-\d{2}-\d{2})\)/i;

function tableCells(line: string): string[] {
  const cells = line.split("|").map((c) => c.trim());
  if (cells.length && cells[0] === "") cells.shift();
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

const SEPARATOR_ROW = /^\|?[\s:|-]+\|?$/;

/** Parse follow-ups.md content into logs + pins (never throws on shape drift). */
export function parseFollowUps(content: string): FollowUpData {
  const lines = content.split(/\r?\n/);
  const logs: FollowUpData["logs"] = [];
  const pins: FollowUpData["pins"] = [];
  let seenTableHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    const pin = PIN_LINE.exec(trimmed);
    if (pin) {
      pins.push({
        appNum: Number.parseInt(pin[1], 10),
        date: pin[2],
        setDate: pin[3],
      });
      continue;
    }

    if (trimmed.startsWith("|")) {
      if (SEPARATOR_ROW.test(trimmed)) continue;
      const cells = tableCells(trimmed);
      // Header row: first cell is the literal column name `num`.
      if (!seenTableHeader) {
        if (cells[0]?.toLowerCase() === "num") {
          seenTableHeader = true;
          continue;
        }
        // A data row before any header — tolerate by treating it as the header.
        seenTableHeader = true;
        continue;
      }
      const num = Number.parseInt(cells[0] ?? "", 10);
      const appNum = Number.parseInt(cells[1] ?? "", 10);
      if (!Number.isInteger(num) || !Number.isInteger(appNum)) continue;
      logs.push({
        num,
        appNum,
        date: cells[2] ?? "",
        company: cells[3] ?? "",
        role: cells[4] ?? "",
        channel: cells[5] ?? "",
        contact: cells[6] ?? "",
        notes: cells[7] ?? "",
      });
    }
  }

  return followUpDataSchema.parse({ logs, pins });
}

/** Last-wins pinned next-date per appNum (helper for the timeline / M4 cadence). */
export function latestPins(data: FollowUpData): Map<number, FollowUpData["pins"][number]> {
  const map = new Map<number, FollowUpData["pins"][number]>();
  for (const pin of data.pins) map.set(pin.appNum, pin); // later entries overwrite
  return map;
}
