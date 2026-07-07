"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
        <ApplicationDetail num={num} />
      </SheetContent>
    </Sheet>
  );
}
