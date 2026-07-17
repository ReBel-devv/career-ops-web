"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClientConfig } from "@/components/providers/app-providers";
import { useRunScan, useScanStatus } from "@/lib/client/queries";

/**
 * "Run scan" — kicks off the zero-token portal scanner server-side. Results
 * land exactly where the user is looking (pipeline inbox + scan history), so
 * the success path is just a toast + query invalidation. `useScanStatus`
 * covers the reload-mid-scan case: the button re-attaches to an in-flight
 * scan, and its true→false flip refreshes the tabs the mutation would have.
 */
export function ScanButton() {
  const { demoMode, readOnly } = useClientConfig();
  const qc = useQueryClient();
  const scan = useRunScan();
  const status = useScanStatus();

  const running = scan.isPending || status.data === true;

  // Re-attached scan finished (we never ran the mutation) → refresh its output.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && status.data === false && !scan.isPending) {
      void qc.invalidateQueries({ queryKey: ["pipeline"] });
      void qc.invalidateQueries({ queryKey: ["scan-history"] });
    }
    wasRunning.current = status.data === true;
  }, [status.data, scan.isPending, qc]);

  // The scanner spawns `scan.mjs` on the local repo — meaningless in demo
  // mode and blocked under READ_ONLY, so don't show a dead button.
  if (demoMode || readOnly) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => scan.mutate()}
      disabled={running}
    >
      {running ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <Radar className="size-3.5" aria-hidden />
      )}
      {running ? "Scanning…" : "Run scan"}
    </Button>
  );
}
