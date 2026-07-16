"use client";

import type { VendorChartData } from "@/lib/analytics";
import { ChartEmpty } from "./chart-card";
import { RateBars } from "./rate-bars";

/**
 * ATS channel yield — advance rate per vendor, rendered through the shared
 * RateBars (F5 honesty rules: low-n bars grayed but never hidden, every rate
 * carries its n).
 */
export function VendorChart({ chart }: { chart: VendorChartData }) {
  if (chart.data.length === 0) {
    return (
      <ChartEmpty>
        No submitted application routed through an identified ATS vendor yet
        ({chart.identified} of {chart.submitted} submitted identified).
      </ChartEmpty>
    );
  }

  return (
    <RateBars
      data={chart.data.map((d) => ({
        label: d.vendor,
        n: d.total,
        advanced: d.advanced,
        rate: d.advanceRate,
        grayed: d.grayed,
      }))}
      minSample={chart.minSample}
    />
  );
}
