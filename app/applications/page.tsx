import type { Metadata } from "next";
import { Suspense } from "react";
import { ApplicationsView } from "@/components/applications/applications-view";

export const metadata: Metadata = { title: "Applications" };

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
