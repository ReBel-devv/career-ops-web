import { NextResponse } from "next/server";
import { PipelineWriteError, type PipelineWriteErrorCode } from "@/lib/writers";

/** PipelineWriteError code → HTTP status (mirrors the other write mappings). */
const ERROR_STATUS: Record<PipelineWriteErrorCode, number> = {
  INVALID_INPUT: 400,
  READ_ONLY: 403,
  LOCK_TIMEOUT: 503,
  PARSE_FAILED: 500,
};

/** Map any thrown error to a JSON response with the right status. */
export function pipelineErrorResponse(error: unknown): NextResponse {
  if (error instanceof PipelineWriteError) {
    return NextResponse.json(
      { error: error.message, code: error.code, detail: error.detail },
      { status: ERROR_STATUS[error.code] },
    );
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
