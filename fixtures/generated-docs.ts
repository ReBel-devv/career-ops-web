import type { GeneratedDocument } from "@/lib/domain";
import { slugifyCompany } from "@/lib/parsers/documents";
import { DEMO_APPS } from "./apps";

/**
 * Demo generated-documents library — a tailored CV per application that has a
 * PDF, plus cover letters for the ones that reached "applied" or beyond. The
 * filenames match the `demo-(cv|cover)-…` pattern that `getDemoPdf` serves, so
 * previews work end-to-end in demo mode.
 */

const STATUS_LABEL: Record<string, string> = {
  evaluated: "Evaluated",
  applied: "Applied",
  responded: "Responded",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  discarded: "Discarded",
  skip: "SKIP",
};

const COVER_STATUSES = new Set([
  "applied",
  "responded",
  "interview",
  "offer",
  "rejected",
]);

export function buildDemoGeneratedDocuments(): GeneratedDocument[] {
  const docs: GeneratedDocument[] = [];
  for (const app of DEMO_APPS) {
    if (!app.hasPdf) continue;
    const slug = slugifyCompany(app.company);
    const statusLabel = STATUS_LABEL[app.statusId] ?? app.statusId;
    docs.push({
      kind: "cv",
      fileName: `demo-cv-${slug}.pdf`,
      path: `output/demo-cv-${slug}.pdf`,
      appNum: app.num,
      company: app.company,
      role: app.role,
      statusId: app.statusId,
      statusLabel,
      generatedDate: app.date,
      sizeBytes: 58_000 + ((app.num * 137) % 40_000),
      format: "a4",
    });
    if (COVER_STATUSES.has(app.statusId)) {
      docs.push({
        kind: "cover-letter",
        fileName: `demo-cover-${slug}.pdf`,
        path: `output/demo-cover-${slug}.pdf`,
        appNum: app.num,
        company: app.company,
        role: app.role,
        statusId: app.statusId,
        statusLabel,
        generatedDate: app.date,
        sizeBytes: 32_000 + ((app.num * 91) % 20_000),
        format: "a4",
      });
    }
  }
  return docs.sort((a, b) =>
    (b.generatedDate ?? "").localeCompare(a.generatedDate ?? ""),
  );
}
