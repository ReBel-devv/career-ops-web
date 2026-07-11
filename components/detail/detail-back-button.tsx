"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Back control for the immersive full-screen detail page. Prefers a history
 * back (returns the user to wherever they maximized from — board or table) and
 * falls back to the board for cold deep-links / new-tab opens where there is no
 * in-app history to pop.
 */
export function DetailBackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push("/");
      }}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back
    </button>
  );
}
