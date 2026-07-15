"use client";

import { BookText, FileText, Mic, PenLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ReportMarkdown } from "@/components/report/report-markdown";
import type { ProfileTexts } from "@/lib/domain";

interface TextEntry {
  value: string;
  key: string;
  title: string;
  hint: string;
  icon: LucideIcon;
}

/**
 * The long-form markdown that feeds the profile — CV, the source digest, the
 * writing voice, and writing samples. Rendered read-only in a collapsible
 * accordion (edited in the data repo / via the CLI, not here).
 */
export function ProfileTextsPanel({ texts }: { texts: ProfileTexts }) {
  const entries: TextEntry[] = [];
  if (texts.cv) {
    entries.push({
      value: "cv",
      key: "cv",
      title: "CV",
      hint: "cv.md",
      icon: FileText,
    });
  }
  if (texts.articleDigest) {
    entries.push({
      value: "digest",
      key: "digest",
      title: "Source digest",
      hint: "article-digest.md",
      icon: BookText,
    });
  }
  if (texts.voiceDna) {
    entries.push({
      value: "voice",
      key: "voice",
      title: "Writing voice",
      hint: "voice-dna.md",
      icon: Mic,
    });
  }
  for (const sample of texts.writingSamples) {
    entries.push({
      value: `sample-${sample.name}`,
      key: `sample-${sample.name}`,
      title: sample.name,
      hint: "writing-samples/",
      icon: PenLine,
    });
  }

  const markdownFor = (value: string): string => {
    if (value === "cv") return texts.cv ?? "";
    if (value === "digest") return texts.articleDigest ?? "";
    if (value === "voice") return texts.voiceDna ?? "";
    const sample = texts.writingSamples.find((s) => `sample-${s.name}` === value);
    return sample?.markdown ?? "";
  };

  if (entries.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">CV & voice</h2>
          <p className="text-sm text-muted-foreground">
            The long-form documents that feed your profile.
          </p>
        </div>
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No CV or writing documents found yet.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">CV & voice</h2>
        <p className="text-sm text-muted-foreground">
          The long-form documents that feed your profile (read-only here).
        </p>
      </div>
      <Accordion type="multiple" className="rounded-lg border px-3">
        {entries.map((entry) => {
          const Icon = entry.icon;
          return (
            <AccordionItem key={entry.key} value={entry.value}>
              <AccordionTrigger>
                <span className="flex min-w-0 items-center gap-2">
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="truncate font-medium">{entry.title}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {entry.hint}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ReportMarkdown markdown={markdownFor(entry.value)} />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
}
