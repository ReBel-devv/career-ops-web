"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EvaluateNextButton, EvaluationEffects } from "./evaluate";
import { PipelineInbox } from "./pipeline-inbox";
import { ScanButton } from "./scan-button";
import { ScanHistoryTable } from "./scan-history-table";

/**
 * /discovery — the pipeline inbox (data/pipeline.md Pending/Processed) and the
 * portal scan history (data/scan-history.tsv). Write affordances live on the
 * tab row: "Run scan" (the zero-token portal scanner, whose output fills both
 * tabs) and "Add offer" (manual `[!]` offers, routes to /discovery/add).
 */
export function DiscoveryView() {
  return (
    <Tabs defaultValue="pipeline" className="gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <TabsList className="w-full md:w-fit">
          <TabsTrigger value="pipeline">Pipeline inbox</TabsTrigger>
          <TabsTrigger value="scan">Scan history</TabsTrigger>
        </TabsList>
        {/* Mobile: full-bleed row where buttons grow to fill the width (never
            shrink — nowrap labels stay intact). flex-wrap only kicks in when
            the labels genuinely don't fit (sub-360px), dropping a button to the
            next line instead of overflowing the viewport. */}
        <div className="flex flex-wrap items-center gap-2 max-md:[&>*]:grow">
          <EvaluationEffects />
          <EvaluateNextButton />
          <ScanButton />
          <Button asChild size="sm" variant="secondary">
            <Link href="/discovery/add">
              <Plus className="size-3.5" aria-hidden />
              Add offer
            </Link>
          </Button>
        </div>
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
