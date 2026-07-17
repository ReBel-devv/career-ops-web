import type { Metadata } from "next";
import { TemplatesView } from "@/components/templates/templates-view";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Templates</h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Reusable outreach texts — versioned, copy-ready, agent-editable
        </p>
      </div>
      <TemplatesView />
    </div>
  );
}
