import type { Metadata } from "next";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <div className="px-4 py-6 md:px-6">
      <h1 className="mb-4 text-lg font-semibold tracking-tight">Analytics</h1>
      <AnalyticsView />
    </div>
  );
}
