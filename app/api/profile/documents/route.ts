import { NextResponse } from "next/server";
import { getDataSource } from "@/lib/data";
import { PROFILE_UPLOAD_MAX_BYTES } from "@/lib/domain";
import { readOnlyGuard } from "@/lib/api/follow-up-error";
import { profileErrorResponse } from "@/lib/api/profile-error";

// Living data — never cache.
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/documents — upload a source document into `sources/`.
 * multipart/form-data with a single `file` field. Never overwrites (the writer
 * de-duplicates the name). Returns the created descriptor.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = readOnlyGuard();
  if (guard) return guard;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided (expected a `file` field)." },
      { status: 400 },
    );
  }
  if (file.size > PROFILE_UPLOAD_MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large (max ${Math.floor(
          PROFILE_UPLOAD_MAX_BYTES / (1024 * 1024),
        )} MB).`,
      },
      { status: 400 },
    );
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const document = await getDataSource().addProfileDocument(file.name, bytes);
    return NextResponse.json({ document }, { status: 201 });
  } catch (error: unknown) {
    return profileErrorResponse(error);
  }
}
