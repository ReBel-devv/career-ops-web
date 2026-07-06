import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Discovery" };

export default function DiscoveryPage() {
  return (
    <PlaceholderPage
      title="Discovery"
      description="Read-only pipeline inbox (pending and processed URLs) plus portal scan history."
      milestone="M5"
    />
  );
}
