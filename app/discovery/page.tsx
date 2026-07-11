import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DiscoveryView } from "@/components/discovery/discovery-view";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Discovery" };

export default function DiscoveryPage() {
  return (
    <div className="px-4 py-6 md:px-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Discovery</h1>
        <Button asChild size="sm" variant="secondary" className="ml-auto">
          <Link href="/discovery/add">
            <Plus className="size-3.5" aria-hidden />
            Add offer
          </Link>
        </Button>
      </div>
      <DiscoveryView />
    </div>
  );
}
