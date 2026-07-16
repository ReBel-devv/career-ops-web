/**
 * Same-origin guard for the assistant routes (security review 2026-07-16).
 *
 * The assistant runs unauthenticated on localhost, so any webpage open in the
 * user's browser could otherwise POST to it (a `text/plain` form bypasses the
 * CORS preflight) and drive the agent — including in autonomous mode. Browsers
 * always attach `Origin` to cross-origin POSTs and `Sec-Fetch-Site` to all
 * fetches, so rejecting mismatches closes the drive-by hole while leaving
 * same-origin app calls and non-browser local tooling (curl, scripts) intact.
 */
export function rejectCrossOrigin(request: Request): Response | null {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    const host = request.headers.get("host");
    try {
      if (new URL(origin).host !== host) {
        return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
      }
    } catch {
      return Response.json({ error: "Invalid Origin header." }, { status: 403 });
    }
  } else if (origin === "null") {
    // Opaque origin (sandboxed iframe / data: URL) — never legitimate here.
    return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  return null;
}
