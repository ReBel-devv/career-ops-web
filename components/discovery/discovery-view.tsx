"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PipelineInbox } from "./pipeline-inbox";
import { ScanHistoryTable } from "./scan-history-table";

/**
 * /discovery — the pipeline inbox (data/pipeline.md Pending/Processed) and the
 * portal scan history (data/scan-history.tsv). Both read-only views; the one
 * write affordance is "Add offer" (manual `[!]` offers), which lives on the tab
 * row and routes to /discovery/add.
 */
export function DiscoveryView() {
  return (
    <Tabs defaultValue="pipeline" className="gap-4">
      <div className="flex items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline inbox</TabsTrigger>
          <TabsTrigger value="scan">Scan history</TabsTrigger>
        </TabsList>
        <Button asChild size="sm" variant="secondary">
          <Link href="/discovery/add">
            <Plus className="size-3.5" aria-hidden />
            Add offer
          </Link>
        </Button>
      </div>
      <TabsContent value="pipeline">
        <PipelineInbox />
      </TabsContent>
      <TabsContent value="scan">
        <ScanHistoryTable />
      </TabsContent>
    </Tabs>
  );
}
