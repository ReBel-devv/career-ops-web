import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ num: string }>;
}) {
  const { num } = await params;
  const parsed = Number.parseInt(num, 10);
  const label = Number.isNaN(parsed) ? num : `#${String(parsed).padStart(3, "0")}`;
  return (
    <PlaceholderPage
      title={`Application ${label}`}
      description="Detail view — report header, Machine Summary panel, score table, rendered Blocks A–G, documents, timeline, and notes editor."
      milestone="M3"
    />
  );
}
