"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { ApplicationDetail } from "@/components/detail/application-detail";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/**
 * Right-side drawer wrapper for the intercepted `/app/[num]` route (plan §2:
 * drawer on desktop, full page on mobile — on small screens the sheet is
 * full-width, giving the full-page feel; hard refresh / deep link renders the
 * real full page instead). Closing navigates back to the originating list.
 */
export function DetailDrawer({ num }: { num: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
          router.back();
        }
      }}
    >
      <SheetContent
        side="right"
        className="w-full max-w-full sm:max-w-xl lg:max-w-2xl"
      >
        <SheetTitle className="sr-only">
          Application #{String(num).padStart(3, "0")} detail
        </SheetTitle>
        {/*
          Maximize → the real, shareable full-screen page. A plain <a> (not
          next/link) forces a document navigation, which bypasses the
          `(.)app/[num]` intercept that would otherwise just re-open this drawer.
          Bonus: cmd/ctrl-click opens the detail in a new tab. Sits to the left
          of the Sheet's own close (X) button.
        */}
        <a
          href={`/app/${num}`}
          aria-label="Open full screen"
          title="Open full screen"
          className="absolute top-4 right-12 rounded-sm text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Maximize2 className="size-4" aria-hidden />
        </a>
        <ApplicationDetail num={num} />
      </SheetContent>
    </Sheet>
  );
}
