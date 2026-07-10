import type { Metadata } from "next";
import { Suspense } from "react";
import { ApplicationsView } from "@/components/applications/applications-view";

export const metadata: Metadata = { title: "Applications" };

// Same URL-filter surface as the board: force request-time rendering so
// `router.replace` filter commits work when the page is loaded with search
// params in production (see app/page.tsx for the observed Next 16.2 no-op).
export const dynamic = "force-dynamic";

export default function ApplicationsPage() {
  return (
    <div className="px-4 py-6 md:px-6">
      {/* useSearchParams (filters) requires a Suspense boundary. */}
      <Suspense fallback={null}>
        <ApplicationsView />
      </Suspense>
    </div>
  );
}
