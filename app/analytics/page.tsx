import type { Metadata } from "next";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Pipeline patterns from analyze-patterns.mjs — shown, never rephrased
        </p>
      </div>
      <AnalyticsView />
    </div>
  );
}
