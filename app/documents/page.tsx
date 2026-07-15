import type { Metadata } from "next";
import { DocumentsLibrary } from "@/components/documents/documents-library";

export const metadata: Metadata = { title: "CVs & Letters" };

export default function DocumentsPage() {
  return (
    <div className="px-4 py-6 md:px-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4">
          <h1 className="text-lg font-semibold tracking-tight">CVs &amp; Letters</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every tailored CV and cover letter generated for your applications.
          </p>
        </div>
        <DocumentsLibrary />
      </div>
    </div>
  );
}
