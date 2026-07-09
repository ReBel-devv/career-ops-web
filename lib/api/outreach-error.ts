import { NextResponse } from "next/server";
import { OutreachWriteError, type OutreachWriteErrorCode } from "@/lib/writers";

/** OutreachWriteError code → HTTP status (mirrors the M1/M4 mappings). */
const ERROR_STATUS: Record<OutreachWriteErrorCode, number> = {
  INVALID_INPUT: 400,
  READ_ONLY: 403,
  NOT_FOUND: 404,
  LOCK_TIMEOUT: 503,
  PARSE_FAILED: 500,
};

/** Map any thrown error to a JSON response with the right status. */
export function outreachErrorResponse(error: unknown): NextResponse {
  if (error instanceof OutreachWriteError) {
    return NextResponse.json(
      { error: error.message, code: error.code, detail: error.detail },
      { status: ERROR_STATUS[error.code] },
    );
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
