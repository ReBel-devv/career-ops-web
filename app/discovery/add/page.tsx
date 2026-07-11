import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AddOfferForm } from "@/components/discovery/add-offer-form";

export const metadata: Metadata = { title: "Add offer" };

/**
 * /discovery/add — manually queue an offer whose posting can't be auto-scanned
 * (LinkedIn, Welcome to the Jungle, …). Two fields: the URL and the pasted job
 * description. Centered card, consistent with the rest of the app. Queue-only;
 * the CLI `pipeline` mode evaluates it afterwards.
 */
export default function AddOfferPage() {
  return (
    <div className="px-4 py-8 md:px-6 md:py-12">
      <div className="mx-auto w-full max-w-xl">
        <Link
          href="/discovery"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Discovery
        </Link>

        <div className="mt-3 rounded-xl border bg-card p-6 shadow-xs">
          <h1 className="text-lg font-semibold tracking-tight">Add an offer</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            For postings the scanner can&apos;t reach (LinkedIn, Welcome to the
            Jungle, …). Paste the link and the job description — it&apos;s queued in
            the pipeline inbox and evaluated when you run{" "}
            <code className="font-mono text-[0.8em]">/career-ops pipeline</code>.
          </p>

          <div className="mt-5 border-t pt-5">
            <AddOfferForm />
          </div>
        </div>
      </div>
    </div>
  );
}
