import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { isValidTemplateSlug } from "@/lib/writers";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** GET /api/templates/[slug]/versions/[version] — one archived version's body. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; version: string }> },
): Promise<NextResponse> {
  const { slug, version: versionRaw } = await context.params;
  const version = Number.parseInt(versionRaw, 10);
  if (
    !isValidTemplateSlug(slug) ||
    !Number.isInteger(version) ||
    version <= 0 ||
    String(version) !== versionRaw.trim()
  ) {
    return NextResponse.json(
      { error: `Invalid template version: ${slug}@${versionRaw}` },
      { status: 400 },
    );
  }
  try {
    const found = await getDataSource().getTemplateVersion(slug, version);
    if (!found) {
      return NextResponse.json(
        { error: `Version ${version} of "${slug}" not found.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ version: found });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
