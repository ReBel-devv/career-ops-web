/**
 * Turn an `AssistantEvent` async generator into a Server-Sent Events
 * `ReadableStream` suitable for a Next.js Route Handler `Response`.
 *
 * Each event is emitted as a single `data:` frame whose JSON payload carries
 * its own `type`, so the client just parses and switches on `event.type`.
 */
import type { AssistantEvent } from "./types";

/** Recommended headers for an SSE response (no buffering, no caching). */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Defeat reverse-proxy buffering so chunks flush immediately.
  "X-Accel-Buffering": "no",
};

/** Serialize one event as an SSE frame. */
function frame(event: AssistantEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Build the SSE `ReadableStream`. Consumes `events` to completion (or until the
 * client disconnects, which surfaces as an enqueue failure / cancel).
 */
export function sseStream(
  events: AsyncGenerator<AssistantEvent>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(frame(event)));
        }
      } catch {
        // The generator itself never throws (it maps errors to events); this
        // guards against enqueue-after-close when the client has gone away.
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a client disconnect — nothing to do.
        }
      }
    },
    cancel() {
      // Client disconnected; ask the generator to stop and release the query.
      void events.return(undefined);
    },
  });
}
