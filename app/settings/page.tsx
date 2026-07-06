import type { Metadata } from "next";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Settings" };

// Reflect the live environment on every request.
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const config = getConfig();
  const rows: Array<{ label: string; value: string; ok: boolean }> = [
    {
      label: "Data repo (CAREER_OPS_PATH)",
      value: config.careerOpsPath ?? "not set",
      ok: config.careerOpsPath !== null || config.demoMode,
    },
    {
      label: "Demo mode",
      value: config.demoMode ? "on — serving fixture data" : "off",
      ok: true,
    },
    {
      label: "Read-only",
      value: config.readOnly ? "on — mutations disabled" : "off",
      ok: true,
    },
  ];

  return (
    <div className="px-4 py-6 md:px-6">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        Environment status. Data-health checks and theme options land in later milestones.
      </p>
      <dl className="mt-6 max-w-2xl divide-y rounded-lg border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-data text-muted-foreground">{row.label}</dt>
            <dd className="flex items-center gap-2 text-right font-mono text-data">
              <span
                aria-hidden
                className={`size-2 rounded-full ${row.ok ? "bg-status-offer" : "bg-status-rejected"}`}
              />
              <span className="max-w-96 truncate" title={row.value}>
                {row.value}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
