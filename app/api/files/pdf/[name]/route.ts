import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { safePdfPath } from "@/lib/files/pdf";

// Living data — never cache.
export const dynamic = "force-dynamic";

/**
 * GET /api/files/pdf/[name] — stream a generated PDF from `<repo>/output/`.
 * Never static; strict path-traversal guard (plain `.pdf` basename, resolved +
 * prefix-checked inside `output/`). Demo mode has no real files → 404.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await context.params;
  const config = getConfig();
  if (config.demoMode || !config.careerOpsPath) {
    return NextResponse.json({ error: "No document store" }, { status: 404 });
  }

  const outputDir = path.join(config.careerOpsPath, "output");
  const filePath = safePdfPath(outputDir, name);
  if (!filePath) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(filePath);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(data.byteLength),
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
