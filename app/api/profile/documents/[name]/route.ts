import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";

// Living data — never cache.
export const dynamic = "force-dynamic";

/** Content type for the extensions we allow in `sources/`. */
const CONTENT_TYPE: Record<string, string> = {
  pdf: "application/pdf",
  md: "text/markdown; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

/**
 * GET /api/profile/documents/[name] — stream a source document from `sources/`
 * for inline preview (PDF) or download. Traversal-guarded in the data source
 * (plain basename, resolved + prefix-checked). Demo mode serves no bytes (404).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await context.params;
  const decoded = safeDecode(name);
  if (decoded === null) {
    return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
  }

  let doc: { bytes: Uint8Array; ext: string } | null;
  try {
    doc = await getDataSource().readProfileDocument(decoded);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const contentType = CONTENT_TYPE[doc.ext] ?? "application/octet-stream";
  // PDFs and text render inline; office docs download.
  const inline = doc.ext === "pdf" || CONTENT_TYPE[doc.ext]?.startsWith("text/");
  const disposition = inline ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(doc.bytes), {
    headers: {
      "content-type": contentType,
      "content-length": String(doc.bytes.byteLength),
      "content-disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(decoded)}`,
      "cache-control": "no-store",
    },
  });
}

/** Decode a URL segment, rejecting anything that smells like traversal. */
function safeDecode(name: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    return null;
  }
  if (
    decoded === "" ||
    decoded.includes("/") ||
    decoded.includes("\\") ||
    decoded.includes("..") ||
    decoded.startsWith(".")
  ) {
    return null;
  }
  return decoded;
}
