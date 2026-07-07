"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PipelineInbox } from "./pipeline-inbox";
import { ScanHistoryTable } from "./scan-history-table";

/**
 * /discovery — READ-ONLY (plan §3 Discovery P1): the pipeline inbox
 * (data/pipeline.md Pending/Processed) and the portal scan history
 * (data/scan-history.tsv). Zero write affordances by design — nothing on this
 * screen mutates the data repo.
 */
export function DiscoveryView() {
  return (
    <Tabs defaultValue="pipeline" className="gap-4">
      <TabsList>
        <TabsTrigger value="pipeline">Pipeline inbox</TabsTrigger>
        <TabsTrigger value="scan">Scan history</TabsTrigger>
      </TabsList>
      <TabsContent value="pipeline">
        <PipelineInbox />
      </TabsContent>
      <TabsContent value="scan">
        <ScanHistoryTable />
      </TabsContent>
    </Tabs>
  );
}
