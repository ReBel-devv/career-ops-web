import type { Metadata } from "next";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { getConfig } from "@/lib/config";
import { getDataSource } from "@/lib/data";
import type { Application, CanonicalState } from "@/lib/domain";

export const metadata: Metadata = { title: "Applications" };

// Living data — always read the tracker at request time.
export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  let applications: Application[] | null = null;
  let states: CanonicalState[] = [];
  let error: string | null = null;
  const config = getConfig();
  try {
    const source = getDataSource();
    [applications, states] = await Promise.all([
      source.getApplications(),
      source.getStates(),
    ]);
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="px-4 py-6 md:px-6">
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Applications</h1>
        {applications ? (
          <span className="font-mono text-data tabular-nums text-muted-foreground">
            {applications.length}
          </span>
        ) : null}
      </div>
      {error !== null ? (
        <div
          role="alert"
          className="max-w-prose rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <p className="font-medium">Could not read the tracker</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      ) : (
        <ApplicationsTable
          applications={applications ?? []}
          states={states}
          readOnly={config.readOnly && !config.demoMode}
        />
      )}
    </div>
  );
}
