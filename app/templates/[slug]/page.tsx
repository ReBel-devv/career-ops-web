import type { Metadata } from "next";
import {
  TemplateDetail,
  TemplatesBackLink,
} from "@/components/templates/template-detail";

export const metadata: Metadata = { title: "Template" };

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="flex flex-col gap-4 px-4 py-6 md:px-6">
      <TemplatesBackLink />
      <TemplateDetail slug={slug} />
    </div>
  );
}
