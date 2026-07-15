import { NextResponse } from "next/server";
import { ProfileWriteError, type ProfileWriteErrorCode } from "@/lib/writers";

/** ProfileWriteError code → HTTP status (mirrors the other write mappings). */
const ERROR_STATUS: Record<ProfileWriteErrorCode, number> = {
  INVALID_INPUT: 400,
  READ_ONLY: 403,
  NOT_FOUND: 404,
  STALE_FIELD: 409,
  LOCK_TIMEOUT: 503,
  PARSE_FAILED: 500,
};

/** Map any thrown error to a JSON response with the right status. */
export function profileErrorResponse(error: unknown): NextResponse {
  if (error instanceof ProfileWriteError) {
    return NextResponse.json(
      { error: error.message, code: error.code, detail: error.detail },
      { status: ERROR_STATUS[error.code] },
    );
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
