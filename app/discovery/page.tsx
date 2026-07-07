import type { Metadata } from "next";
import { DiscoveryView } from "@/components/discovery/discovery-view";

export const metadata: Metadata = { title: "Discovery" };

export default function DiscoveryPage() {
  return (
    <div className="px-4 py-6 md:px-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Discovery</h1>
        <span className="rounded-sm border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          read-only
        </span>
      </div>
      <DiscoveryView />
    </div>
  );
}
