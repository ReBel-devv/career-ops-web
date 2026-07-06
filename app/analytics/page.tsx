import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <PlaceholderPage
      title="Analytics"
      description="Funnel conversion, score distribution, archetype and ATS-vendor breakdowns — fed by analyze-patterns.mjs."
      milestone="M5"
    />
  );
}
