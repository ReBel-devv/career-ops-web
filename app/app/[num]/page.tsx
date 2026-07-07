import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ApplicationDetail } from "@/components/detail/application-detail";

export const metadata: Metadata = { title: "Application" };

/**
 * Full-page application detail (plan §2) — the surface for mobile and for
 * deep links / hard refreshes. Client-side navigation from the board or the
 * table is intercepted by `app/@drawer/(.)app/[num]` and rendered as a
 * right-side drawer on desktop instead.
 */
export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ num: string }>;
}) {
  const { num: numRaw } = await params;
  const num = Number.parseInt(numRaw, 10);

  if (!Number.isInteger(num) || num <= 0) {
    return (
      <div className="px-4 py-6 md:px-6">
        <p className="text-sm text-muted-foreground">
          Invalid application number: {numRaw}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Sticky header (mobile-first, plan §2) */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
        <Link
          href="/applications"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Applications
        </Link>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          / #{String(num).padStart(3, "0")}
        </span>
      </div>
      <div className="px-4 py-6 md:px-6">
        <ApplicationDetail num={num} />
      </div>
    </div>
  );
}
