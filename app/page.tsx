import type { Metadata } from "next";
import { Suspense } from "react";
import { Board } from "@/components/board/board";
import { FilterBar } from "@/components/filters/filter-bar";

export const metadata: Metadata = { title: "Board" };

export default function BoardPage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Board</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Drag cards between statuses to update the tracker
        </p>
      </div>
      {/* FilterBar + Board both read filters from the URL (useSearchParams). */}
      <Suspense fallback={null}>
        <FilterBar />
        <Board />
      </Suspense>
    </div>
  );
}
