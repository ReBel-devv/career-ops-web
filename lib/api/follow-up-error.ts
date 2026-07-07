import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { FollowUpWriteError, type FollowUpWriteErrorCode } from "@/lib/writers";

/** FollowUpWriteError code → HTTP status (mirrors the tracker PATCH mapping). */
const ERROR_STATUS: Record<FollowUpWriteErrorCode, number> = {
  INVALID_INPUT: 400,
  READ_ONLY: 403,
  LOCK_TIMEOUT: 503,
  PARSE_FAILED: 500,
};

/** Parse and validate the `[num]` route segment; returns null when invalid. */
export function parseAppNum(numRaw: string): number | null {
  const num = Number.parseInt(numRaw, 10);
  if (!Number.isInteger(num) || num <= 0 || String(num) !== numRaw.trim()) {
    return null;
  }
  return num;
}

/**
 * Belt-and-suspenders READ_ONLY guard (Decision 7): blocks real-fs mutations
 * at the route edge. Demo writes are in-memory and allowed. Returns a 403
 * response to short-circuit, or null to proceed.
 */
export function readOnlyGuard(): NextResponse | null {
  const config = getConfig();
  if (config.readOnly && !config.demoMode) {
    return NextResponse.json(
      { error: "READ_ONLY is set — all mutations are disabled." },
      { status: 403 },
    );
  }
  return null;
}

/** Map any thrown error to a JSON response with the right status. */
export function followUpErrorResponse(error: unknown): NextResponse {
  if (error instanceof FollowUpWriteError) {
    return NextResponse.json(
      { error: error.message, code: error.code, detail: error.detail },
      { status: ERROR_STATUS[error.code] },
    );
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
