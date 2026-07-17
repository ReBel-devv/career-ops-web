"use client";

import { ReportMarkdown } from "@/components/report/report-markdown";
import { useTypewriter } from "./use-typewriter";

/**
 * A text block rendered as markdown, revealed progressively while it streams so
 * the agent reads as if it were typing live (see {@link useTypewriter}). Once
 * the block is done (`animate` false) the full markdown renders at once.
 */
export function StreamingMarkdown({
  markdown,
  animate,
  className,
}: {
  markdown: string;
  animate: boolean;
  className?: string;
}) {
  const shown = useTypewriter(markdown, animate);
  return <ReportMarkdown markdown={shown} className={className} />;
}
