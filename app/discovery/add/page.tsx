import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AddOfferForm } from "@/components/discovery/add-offer-form";

export const metadata: Metadata = { title: "Add offer" };

/**
 * /discovery/add — manually queue an offer whose posting can't be auto-scanned
 * (LinkedIn, Welcome to the Jungle, …). Two fields: the URL and the pasted job
 * description. Queue-only; the CLI `pipeline` mode evaluates it afterwards.
 */
export default function AddOfferPage() {
  return (
    <div className="px-4 py-6 md:px-6">
      <div className="mb-1">
        <Link
          href="/discovery"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Discovery
        </Link>
      </div>
      <h1 className="text-lg font-semibold tracking-tight">Add an offer</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-muted-foreground">
        For postings the scanner can&apos;t reach (LinkedIn, Welcome to the Jungle,
        …). Paste the link and the job description — it&apos;s queued in the pipeline
        inbox and evaluated when you run <code className="font-mono">/career-ops
        pipeline</code>.
      </p>
      <AddOfferForm />
    </div>
  );
}
