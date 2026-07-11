import type { Metadata } from "next";
import { ApplicationDetail } from "@/components/detail/application-detail";
import { DetailBackButton } from "@/components/detail/detail-back-button";

export const metadata: Metadata = { title: "Application" };

/**
 * Immersive full-screen application detail (plan §2) — the surface for mobile,
 * deep links / hard refreshes, AND the "maximize" action from the desktop
 * drawer. Client-side navigation from the board or the table is intercepted by
 * `app/@drawer/(.)app/[num]` and shown as a right-side drawer; only a real
 * navigation (deep link, refresh, or the drawer's maximize anchor) lands here.
 *
 * It renders as a `fixed inset-0` overlay above the app shell (nav rail z-30,
 * stats header z-20) so the reader gets the whole viewport — no rail, generous
 * reading width — while staying a genuine, shareable, refresh-safe route. The
 * overlay is self-contained here, so it never affects the intercepted drawer
 * render (which shows the board behind it, untouched).
 */
export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ num: string }>;
}) {
  const { num: numRaw } = await params;
  const num = Number.parseInt(numRaw, 10);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <DetailBackButton />
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {Number.isInteger(num) && num > 0 ? `#${String(num).padStart(3, "0")}` : numRaw}
        </span>
      </header>

      <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto">
        {Number.isInteger(num) && num > 0 ? (
          <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
            <ApplicationDetail num={num} />
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground md:px-8">
            Invalid application number: {numRaw}
          </p>
        )}
      </div>
    </div>
  );
}
