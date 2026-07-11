import type { Metadata } from "next";
import { DiscoveryView } from "@/components/discovery/discovery-view";

export const metadata: Metadata = { title: "Discovery" };

export default function DiscoveryPage() {
  return (
    <div className="px-4 py-6 md:px-6">
      <h1 className="mb-4 text-lg font-semibold tracking-tight">Discovery</h1>
      <DiscoveryView />
    </div>
  );
}
