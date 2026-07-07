"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";

/**
 * Renders a report's French markdown (Blocks A–G) with GFM tables. All HTML is
 * sanitized (rehype-sanitize) — reports are trusted content, but the report
 * body is still passed through the sanitizer as a hard rule (never render raw
 * unsanitized markdown). GFM tables scroll horizontally inside their own
 * container so the page body never scrolls sideways.
 */
export function ReportMarkdown({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  return (
    <div className={cn("report-prose", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-md border">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
